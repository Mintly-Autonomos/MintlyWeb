import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryBehavior, DreGroup, MovementChannel } from 'mintly-lib';
import type {
  ExpensesReport,
  ExpensesQuery,
  ExpenseItem,
  ExpenseSubitem,
  ExpenseAnomaly,
  Headers,
} from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { MintlyClientService } from './mintly-client.service';
import mockCustos from '../mocks/mock_custos.json';

export type { ExpensesReport, ExpensesQuery, ExpenseItem, ExpenseSubitem, ExpenseAnomaly };
export type ChannelFilter = 'dineIn' | 'delivery' | undefined;

function delay(ms = 380): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MockSub {
  nome: string;
  valorMesAtual: number;
  valorMesAnterior: number;
  mediaUlt3Meses: number;
  tipo: 'fixo' | 'variavel';
}
interface MockCat {
  categoria: string;
  tipo: 'Fixo' | 'Variável' | 'Misto';
  icon: string;
  nota: string;
  subitens: MockSub[];
}

const BEHAVIOR: Record<MockCat['tipo'], CategoryBehavior> = {
  Fixo: CategoryBehavior.Fixed,
  Variável: CategoryBehavior.Variable,
  Misto: CategoryBehavior.Mixed,
};
const DREGROUP_GUESS: Record<string, DreGroup> = {
  'CMV / Insumos': DreGroup.Cmv,
  'Pró-labore família': DreGroup.Labor,
};

/**
 * Mock aproximado pra dev local sem a MintlyApi no ar (`environment.useMocks: true`) — mesmo
 * contrato real (`ExpensesReport`), construído a partir de `mocks/mock_custos.json`. Não
 * reproduz o filtro de canal nem a projeção do mês atual com fidelidade — só dados plausíveis.
 */
function buildMockReport(month?: string): ExpensesReport {
  const cats = mockCustos.categorias as MockCat[];
  const receita = mockCustos.receitaMes;

  const items: ExpenseItem[] = cats
    .map((c): ExpenseItem => {
      const amount = c.subitens.reduce((a, s) => a + s.valorMesAtual, 0);
      const previous = c.subitens.reduce((a, s) => a + s.valorMesAnterior, 0);
      const average3 = c.subitens.reduce((a, s) => a + s.mediaUlt3Meses, 0);
      const subitems: ExpenseSubitem[] = c.subitens.map((s, i): ExpenseSubitem => {
        const excess = s.valorMesAtual - s.mediaUlt3Meses;
        return {
          key: `${c.categoria}-${i}`,
          subcategoryId: `${c.categoria}-${i}`,
          name: s.nome,
          amount: s.valorMesAtual,
          previous: s.valorMesAnterior,
          average3: s.mediaUlt3Meses,
          deltaPrevious: s.valorMesAnterior
            ? (s.valorMesAtual - s.valorMesAnterior) / s.valorMesAnterior
            : null,
          deltaAverage3: s.mediaUlt3Meses ? excess / s.mediaUlt3Meses : null,
          anomaly: s.mediaUlt3Meses > 0 && excess / s.mediaUlt3Meses > 0.3,
        };
      });
      return {
        key: c.categoria,
        kind: 'category',
        categoryId: c.categoria,
        name: c.categoria,
        behavior: BEHAVIOR[c.tipo],
        dreGroup: DREGROUP_GUESS[c.categoria] ?? DreGroup.Opex,
        amount,
        previous,
        average3,
        deltaPrevious: previous ? (amount - previous) / previous : null,
        deltaAverage3: average3 ? (amount - average3) / average3 : null,
        pctOfRevenue: amount / receita,
        subitems,
        hasAnomaly: subitems.some((s) => s.anomaly),
        history: ['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'].map((mes, i) => ({
          month: mes,
          amount: Math.round(amount * (0.85 + i * 0.03)),
        })),
        projected: null,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const find = (nome: string) => items.find((i) => i.categoryId === nome)!;
  const cmvItem = find('CMV / Insumos');
  const proItem = find('Pró-labore família');
  const ifoodItem = find('Taxa iFood');
  const total = items.reduce((a, i) => a + i.amount, 0);
  const totalAnterior = items.reduce((a, i) => a + i.previous, 0);

  const anomalies: ExpenseAnomaly[] = items.flatMap((item) =>
    item.subitems
      .filter((s) => s.anomaly)
      .map(
        (s): ExpenseAnomaly => ({
          itemKey: item.key,
          categoryId: item.categoryId,
          categoryName: item.name,
          subcategoryId: s.subcategoryId,
          subitemKey: s.key,
          name: s.name,
          amount: s.amount,
          average3: s.average3 ?? 0,
          excess: s.amount - (s.average3 ?? 0),
          pctAbove: s.deltaAverage3 ?? 0,
        }),
      ),
  );

  return {
    referenceMonth: month ?? '2026-07',
    previousMonth: '2026-06',
    channel: null,
    revenue: { current: receita, previous: receita * 0.965 },
    total: {
      current: total,
      previous: totalAnterior,
      average3: totalAnterior,
      deltaPrevious: totalAnterior ? (total - totalAnterior) / totalAnterior : null,
      deltaAverage3: totalAnterior ? (total - totalAnterior) / totalAnterior : null,
    },
    cmv: {
      amount: cmvItem.amount,
      pctOfRevenue: cmvItem.amount / receita,
      target: { min: 0.28, max: 0.35 },
    },
    primeCost: {
      amount: cmvItem.amount + proItem.amount,
      cmv: cmvItem.amount,
      labor: proItem.amount,
      pctOfRevenue: (cmvItem.amount + proItem.amount) / receita,
      targetMax: 0.65,
    },
    platformFee: {
      amount: ifoodItem.amount,
      previous: ifoodItem.previous,
      deltaPrevious: ifoodItem.deltaPrevious,
      deliveryRevenue: mockCustos.receitaDeliveryMes,
      pctOfDelivery: ifoodItem.amount / mockCustos.receitaDeliveryMes,
    },
    byBehavior: {
      fixed: items
        .filter((i) => i.behavior === CategoryBehavior.Fixed)
        .reduce((a, i) => a + i.amount, 0),
      variable: items
        .filter((i) => i.behavior === CategoryBehavior.Variable)
        .reduce((a, i) => a + i.amount, 0),
      mixed: items
        .filter((i) => i.behavior === CategoryBehavior.Mixed)
        .reduce((a, i) => a + i.amount, 0),
    },
    items,
    sharedExcluded: null,
    history: ['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'].map((mes, i) => ({
      month: mes,
      total: Math.round(total * (0.85 + i * 0.03)),
    })),
    anomalies: anomalies.sort((a, b) => b.excess - a.excess),
    projection: {
      total: Math.round(total * 1.03),
      revenue: Math.round(receita * 1.03),
      elapsedDays: 20,
      daysInMonth: 31,
    },
    anomalyRule: { minPctAbove: 0.5, minExcess: 100, minHistoryMonths: 2 },
    comparison: { kind: 'fullMonth', untilDay: null },
  };
}

@Injectable({ providedIn: 'root' })
export class CustosService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private reportClient = inject(MintlyClientService).client.reportClient;

  readonly data = signal<ExpensesReport | null>(null);
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

  async refresh(month?: string, channel?: ChannelFilter): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useMocks) {
        await delay();
        this.data.set(buildMockReport(month));
        return;
      }
      const query: ExpensesQuery = {
        month,
        channel:
          channel === 'dineIn'
            ? MovementChannel.DineIn
            : channel === 'delivery'
              ? MovementChannel.Delivery
              : undefined,
      };
      const response = await this.call((headers) => this.reportClient.expenses(query, headers));
      if (!response.payload) throw new Error('Resposta de /reports/expenses sem payload.');
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
