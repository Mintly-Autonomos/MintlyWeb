import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MovementDirection, MovementStatus } from 'mintly-lib';
import type {
  CashFlowReport,
  CashFlowQuery,
  DailyPoint,
  CashFlowWeek,
  DueItem,
  CashFlowInsight,
  Headers,
} from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { MintlyClientService } from './mintly-client.service';
import mockFluxoCaixa from '../mocks/mock_fluxo_caixa.json';

export type { CashFlowReport, CashFlowQuery, DailyPoint, CashFlowWeek, DueItem, CashFlowInsight };

export const MAX_HORIZONTE_DIAS = 365;
/** Dias de margem de segurança do "dia crítico" (N13 — palpite, mesmo valor usado no mock). */
const SAFETY_DAYS = 7;

function baseDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoFromOffset(offset: number): string {
  const d = baseDate();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function offsetFromIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - baseDate().getTime()) / 86400000);
}

export function formatDia(iso: string): string {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatDiaLongo(iso: string): string {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  });
}

/**
 * Mock aproximado pra dev local sem a MintlyApi no ar (`environment.useMocks: true`). Não
 * reproduz as regras exatas do back (canal efetivo, repasses agrupados etc.) — só o suficiente
 * pra telas renderizarem com dados plausíveis. Seed: `mocks/mock_fluxo_caixa.json`.
 */
interface MockSeed {
  offset: number;
  descricao: string;
  valor: number;
  tipo: 'receber' | 'pagar';
  categoria: string;
  quitado?: boolean;
}

function seedsRecorrentes(): MockSeed[] {
  const out: MockSeed[] = [];
  for (let d = 31; d <= MAX_HORIZONTE_DIAS; d++) {
    const w = d % 7;
    if (w === 2)
      out.push({
        offset: d,
        descricao: 'Repasse iFood',
        valor: 3400,
        tipo: 'receber',
        categoria: 'Venda Delivery',
      });
    if (w === 5)
      out.push({
        offset: d,
        descricao: 'Recebível cartão de crédito',
        valor: 3200,
        tipo: 'receber',
        categoria: 'Venda Balcão',
      });
    if (w === 1)
      out.push({
        offset: d,
        descricao: 'Fornecedor Hortifruti',
        valor: 3200,
        tipo: 'pagar',
        categoria: 'CMV/Insumos',
      });
    if (w === 4)
      out.push({
        offset: d,
        descricao: 'Custos operacionais',
        valor: 3200,
        tipo: 'pagar',
        categoria: 'Utilidades',
      });
  }
  return out;
}

const ALL_SEEDS: MockSeed[] = [...(mockFluxoCaixa.seeds as MockSeed[]), ...seedsRecorrentes()];
const SALDO_ATUAL: number = mockFluxoCaixa.saldoAtual;

function mockDueItems(): DueItem[] {
  return ALL_SEEDS.map((s, i): DueItem => {
    const overdue = s.offset < 0 && !s.quitado;
    const settled = s.offset <= 0 && s.quitado;
    return {
      id: `vc-${String(i + 1).padStart(3, '0')}`,
      title: s.descricao,
      category: { _id: s.categoria, name: s.categoria },
      direction: s.tipo === 'receber' ? MovementDirection.In : MovementDirection.Out,
      amount: s.valor,
      dueDate: isoFromOffset(s.offset),
      status: settled ? MovementStatus.Settled : MovementStatus.Pending,
      overdue,
      settledAt: settled ? isoFromOffset(s.offset) : undefined,
      kind: 'movement',
      itemCount: 1,
    };
  });
}

function buildMockReport(horizon: number): CashFlowReport {
  const dueItems = mockDueItems();
  const overdueItems = dueItems.filter((d) => d.overdue);
  const pendingInWindow = dueItems.filter(
    (d) =>
      d.status === MovementStatus.Pending &&
      offsetFromIso(d.dueDate) >= 1 &&
      offsetFromIso(d.dueDate) <= horizon,
  );
  const sum = (items: DueItem[], dir: MovementDirection) =>
    items.filter((d) => d.direction === dir).reduce((a, d) => a + d.amount, 0);

  const receivable =
    sum(pendingInWindow, MovementDirection.In) + sum(overdueItems, MovementDirection.In);
  const payable =
    sum(pendingInWindow, MovementDirection.Out) + sum(overdueItems, MovementDirection.Out);

  const projection: DailyPoint[] = [];
  let saldo = SALDO_ATUAL;
  for (let offset = 0; offset <= horizon; offset++) {
    const doDia = dueItems.filter(
      (d) => d.status === MovementStatus.Pending && offsetFromIso(d.dueDate) === offset,
    );
    let inflows = sum(doDia, MovementDirection.In);
    let outflows = sum(doDia, MovementDirection.Out);
    if (offset === 0) {
      inflows += sum(overdueItems, MovementDirection.In);
      outflows += sum(overdueItems, MovementDirection.Out);
    }
    if (offset > 0) saldo += inflows - outflows;
    projection.push({ date: isoFromOffset(offset), balance: Math.round(saldo), inflows, outflows });
  }

  const realized: DailyPoint[] = [];
  for (let offset = -7; offset < 0; offset++) {
    const doDia = dueItems.filter(
      (d) => d.status === MovementStatus.Settled && d.settledAt === isoFromOffset(offset),
    );
    realized.push({
      date: isoFromOffset(offset),
      balance: SALDO_ATUAL,
      inflows: sum(doDia, MovementDirection.In),
      outflows: sum(doDia, MovementDirection.Out),
    });
  }

  const weeks: CashFlowWeek[] = [];
  const nBlocos = Math.max(1, Math.ceil(horizon / 7));
  let ini = 0;
  for (let i = 0; i < nBlocos; i++) {
    const fim = Math.min(horizon, ini + 6);
    const bloco = projection.filter(
      (p) => offsetFromIso(p.date) >= ini && offsetFromIso(p.date) <= fim,
    );
    weeks.push({
      from: isoFromOffset(ini),
      to: isoFromOffset(fim),
      inflows: bloco.reduce((a, p) => a + p.inflows, 0),
      outflows: bloco.reduce((a, p) => a + p.outflows, 0),
    });
    ini = fim + 1;
    if (ini > horizon) break;
  }

  const lowest = projection.reduce((min, p) => (p.balance < min.balance ? p : min), projection[0]);
  const avgDailyOutflow =
    Math.round(realized.reduce((a, p) => a + p.outflows, 0) / 7) ||
    Math.round(payable / Math.max(horizon, 1));
  const threshold = avgDailyOutflow * SAFETY_DAYS;
  const insights: CashFlowInsight[] = [];
  if (lowest.balance < threshold) {
    insights.push({
      kind: 'criticalDay',
      severity: 'warning',
      date: lowest.date,
      balance: lowest.balance,
      threshold,
    });
  }

  return {
    horizon,
    today: isoFromOffset(0),
    cashToday: SALDO_ATUAL,
    receivable,
    payable,
    projectedBalance: projection[projection.length - 1]?.balance ?? SALDO_ATUAL,
    lowestBalance: { date: lowest.date, balance: lowest.balance },
    overdue: {
      count: overdueItems.length,
      receivable: sum(overdueItems, MovementDirection.In),
      payable: sum(overdueItems, MovementDirection.Out),
    },
    safetyThreshold: { value: threshold, days: SAFETY_DAYS, avgDailyOutflow },
    projection,
    realized,
    weeks,
    dueItems: dueItems.filter(
      (d) => offsetFromIso(d.dueDate) >= -7 && offsetFromIso(d.dueDate) <= horizon,
    ),
    insights,
  };
}

function delay(ms = 380): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class FluxoCaixaService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private reportClient = inject(MintlyClientService).client.reportClient;

  readonly data = signal<CashFlowReport | null>(null);
  readonly loading = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      // 402: a assinatura venceu com o app aberto — leva à tela de assinatura.
      this.auth.onApiError(err);
      if (this.isUnauthorized(err)) {
        const refreshed = await this.auth.refresh();
        if (refreshed) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return typeof err === 'object' && err !== null && apiErrorInfo(err).status === 401;
  }

  async refresh(horizonte: number): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useMocks) {
        await delay();
        this.data.set(buildMockReport(horizonte));
        return;
      }
      const query: CashFlowQuery = { horizon: horizonte };
      const response = await this.call((headers) => this.reportClient.cashFlow(query, headers));
      if (!response.payload) throw new Error('Resposta de /reports/cash-flow sem payload.');
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
