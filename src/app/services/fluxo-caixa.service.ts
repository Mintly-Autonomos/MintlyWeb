import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type VencimentoTipo = 'receber' | 'pagar';
export type VencimentoStatus = 'previsto' | 'pago' | 'recebido' | 'vencido';

export interface Vencimento {
  id: string;
  descricao: string;
  valor: number;
  tipo: VencimentoTipo;
  dataVencimento: string;
  status: VencimentoStatus;
  categoria: string;
  offset: number;
}

export interface PontoFluxo {
  offset: number;
  data: string;
  saldo: number;
  entradas: number;
  saidas: number;
}

export interface ResumoHorizonte {
  horizonte: number;
  aReceber: number;
  aPagar: number;
  saldoPrevisto: number;
  serie: PontoFluxo[];
  menorSaldo: PontoFluxo;
}

export interface Bloco {
  semana: string;
  periodo: string;
  entradas: number;
  saidas: number;
}

export interface FluxoCaixaDataset {
  saldoAtual: number;
  horizonte: number;
  resumo: ResumoHorizonte;
  blocos: Bloco[];
  serieRealizada: PontoFluxo[];
  vencimentos: Vencimento[];
  vencidos: Vencimento[];
  sparksFluxo: { aReceber: number[]; aPagar: number[] };
}

export const SALDO_ATUAL = 18500;
export const LIMITE_ALERTA = 2000;
export const MAX_HORIZONTE_DIAS = 365;

export const SPARKS_FLUXO = {
  aReceber: [26800, 28400, 30100, 29500, 31800, 32500],
  aPagar: [38200, 39600, 41100, 40500, 42800, 47100],
};

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

interface Seed {
  offset: number;
  descricao: string;
  valor: number;
  tipo: VencimentoTipo;
  categoria: string;
  quitado?: boolean;
}

const SEEDS: Seed[] = [
  {
    offset: -5,
    descricao: 'Repasse iFood',
    valor: 2950,
    tipo: 'receber',
    categoria: 'Venda Delivery',
    quitado: true,
  },
  {
    offset: -4,
    descricao: 'Energia elétrica',
    valor: 1120,
    tipo: 'pagar',
    categoria: 'Utilidades',
    quitado: true,
  },
  {
    offset: -2,
    descricao: 'Fornecedor Carnes',
    valor: 3800,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
    quitado: true,
  },
  {
    offset: -1,
    descricao: 'Recebível cartão de crédito',
    valor: 2650,
    tipo: 'receber',
    categoria: 'Venda Balcão',
    quitado: true,
  },
  {
    offset: -9,
    descricao: 'Fornecedor Embalagens',
    valor: 730,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  {
    offset: -6,
    descricao: 'Fornecedor Bebidas',
    valor: 1450,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  { offset: -3, descricao: 'Taxas de cartão', valor: 620, tipo: 'pagar', categoria: 'Taxas' },
  {
    offset: 1,
    descricao: 'Repasse iFood',
    valor: 3200,
    tipo: 'receber',
    categoria: 'Venda Delivery',
  },
  {
    offset: 2,
    descricao: 'Fornecedor Hortifruti',
    valor: 1850,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  {
    offset: 3,
    descricao: 'Recebível cartão de crédito',
    valor: 2900,
    tipo: 'receber',
    categoria: 'Venda Balcão',
  },
  { offset: 4, descricao: 'Energia elétrica', valor: 1180, tipo: 'pagar', categoria: 'Utilidades' },
  { offset: 5, descricao: 'Taxas de cartão', valor: 1420, tipo: 'pagar', categoria: 'Taxas' },
  {
    offset: 6,
    descricao: 'Repasse iFood',
    valor: 3400,
    tipo: 'receber',
    categoria: 'Venda Delivery',
  },
  {
    offset: 8,
    descricao: 'Fornecedor Bebidas',
    valor: 2600,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  {
    offset: 9,
    descricao: 'Recebível cartão de crédito',
    valor: 3100,
    tipo: 'receber',
    categoria: 'Venda Balcão',
  },
  {
    offset: 10,
    descricao: 'Fornecedor Carnes',
    valor: 4900,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  {
    offset: 12,
    descricao: 'Internet e telefone',
    valor: 380,
    tipo: 'pagar',
    categoria: 'Utilidades',
  },
  {
    offset: 13,
    descricao: 'Repasse iFood',
    valor: 3500,
    tipo: 'receber',
    categoria: 'Venda Delivery',
  },
  {
    offset: 15,
    descricao: 'Fornecedor Embalagens',
    valor: 1320,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  {
    offset: 16,
    descricao: 'Recebível cartão de crédito',
    valor: 3250,
    tipo: 'receber',
    categoria: 'Venda Balcão',
  },
  { offset: 17, descricao: 'Água e esgoto', valor: 520, tipo: 'pagar', categoria: 'Utilidades' },
  { offset: 19, descricao: 'Gás de cozinha', valor: 680, tipo: 'pagar', categoria: 'Utilidades' },
  {
    offset: 20,
    descricao: 'Repasse iFood',
    valor: 3600,
    tipo: 'receber',
    categoria: 'Venda Delivery',
  },
  {
    offset: 20,
    descricao: 'Fornecedor Hortifruti',
    valor: 2100,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  { offset: 20, descricao: 'Taxas de cartão', valor: 2300, tipo: 'pagar', categoria: 'Taxas' },
  { offset: 20, descricao: 'Simples Nacional', valor: 3700, tipo: 'pagar', categoria: 'Impostos' },
  {
    offset: 20,
    descricao: 'Manutenção de equipamentos',
    valor: 700,
    tipo: 'pagar',
    categoria: 'Utilidades',
  },
  {
    offset: 21,
    descricao: 'Salários — 1ª parcela',
    valor: 6500,
    tipo: 'pagar',
    categoria: 'Salários',
  },
  { offset: 22, descricao: 'Aluguel do ponto', valor: 2200, tipo: 'pagar', categoria: 'Aluguel' },
  {
    offset: 22,
    descricao: 'Salários — 2ª parcela',
    valor: 5400,
    tipo: 'pagar',
    categoria: 'Salários',
  },
  {
    offset: 23,
    descricao: 'Recebível cartão de crédito',
    valor: 3300,
    tipo: 'receber',
    categoria: 'Venda Balcão',
  },
  {
    offset: 24,
    descricao: 'Fornecedor Hortifruti',
    valor: 1800,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  {
    offset: 26,
    descricao: 'Repasse iFood',
    valor: 3450,
    tipo: 'receber',
    categoria: 'Venda Delivery',
  },
  {
    offset: 27,
    descricao: 'Fornecedor Bebidas',
    valor: 2150,
    tipo: 'pagar',
    categoria: 'CMV/Insumos',
  },
  {
    offset: 28,
    descricao: 'Contas de consumo',
    valor: 1600,
    tipo: 'pagar',
    categoria: 'Utilidades',
  },
  {
    offset: 29,
    descricao: 'Recebível cartão de crédito',
    valor: 2800,
    tipo: 'receber',
    categoria: 'Venda Balcão',
  },
  { offset: 30, descricao: 'Taxas de cartão', valor: 1000, tipo: 'pagar', categoria: 'Taxas' },
];

function seedsRecorrentes(): Seed[] {
  const out: Seed[] = [];
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

const ALL_SEEDS: Seed[] = [...SEEDS, ...seedsRecorrentes()];

function statusDe(s: Seed): VencimentoStatus {
  if (s.offset > 0) return 'previsto';
  if (s.quitado) return s.tipo === 'receber' ? 'recebido' : 'pago';
  return 'vencido';
}

const VENCIMENTOS: Vencimento[] = ALL_SEEDS.map((s, i) => ({
  id: `vc-${String(i + 1).padStart(3, '0')}`,
  descricao: s.descricao,
  valor: s.valor,
  tipo: s.tipo,
  dataVencimento: isoFromOffset(s.offset),
  status: statusDe(s),
  categoria: s.categoria,
  offset: s.offset,
}));

const VENCIDOS = VENCIMENTOS.filter((v) => v.status === 'vencido');

function serieProjecao(horizonte: number): PontoFluxo[] {
  const pontos: PontoFluxo[] = [];
  let saldo = SALDO_ATUAL;
  for (let offset = 0; offset <= horizonte; offset++) {
    const doDia = VENCIMENTOS.filter((v) => v.offset === offset && v.status === 'previsto');
    let entradas = doDia.filter((v) => v.tipo === 'receber').reduce((a, v) => a + v.valor, 0);
    let saidas = doDia.filter((v) => v.tipo === 'pagar').reduce((a, v) => a + v.valor, 0);
    if (offset === 1) {
      entradas += VENCIDOS.filter((v) => v.tipo === 'receber').reduce((a, v) => a + v.valor, 0);
      saidas += VENCIDOS.filter((v) => v.tipo === 'pagar').reduce((a, v) => a + v.valor, 0);
    }
    if (offset > 0) saldo += entradas - saidas;
    pontos.push({
      offset,
      data: isoFromOffset(offset),
      saldo: Math.round(saldo),
      entradas,
      saidas,
    });
  }
  return pontos;
}

function resumoHorizonte(horizonte: number): ResumoHorizonte {
  const noPrazo = VENCIMENTOS.filter(
    (v) => v.status === 'previsto' && v.offset >= 1 && v.offset <= horizonte,
  );
  const aReceber =
    noPrazo.filter((v) => v.tipo === 'receber').reduce((a, v) => a + v.valor, 0) +
    VENCIDOS.filter((v) => v.tipo === 'receber').reduce((a, v) => a + v.valor, 0);
  const aPagar =
    noPrazo.filter((v) => v.tipo === 'pagar').reduce((a, v) => a + v.valor, 0) +
    VENCIDOS.filter((v) => v.tipo === 'pagar').reduce((a, v) => a + v.valor, 0);
  const serie = serieProjecao(horizonte);
  const menorSaldo = serie.reduce((min, p) => (p.saldo < min.saldo ? p : min), serie[0]);
  return {
    horizonte,
    aReceber,
    aPagar,
    saldoPrevisto: SALDO_ATUAL + aReceber - aPagar,
    serie,
    menorSaldo,
  };
}

function blocosHorizonte(horizonte: number): Bloco[] {
  const nBlocos = Math.max(1, Math.min(12, Math.round(horizonte / 7.5)));
  const blocos: Bloco[] = [];
  let ini = 1;
  for (let i = 0; i < nBlocos; i++) {
    const fim = Math.round(((i + 1) * horizonte) / nBlocos);
    if (fim < ini) continue;
    const bloco = VENCIMENTOS.filter(
      (v) => v.status === 'previsto' && v.offset >= ini && v.offset <= fim,
    );
    let entradas = bloco.filter((v) => v.tipo === 'receber').reduce((a, v) => a + v.valor, 0);
    let saidas = bloco.filter((v) => v.tipo === 'pagar').reduce((a, v) => a + v.valor, 0);
    if (ini === 1) {
      entradas += VENCIDOS.filter((v) => v.tipo === 'receber').reduce((a, v) => a + v.valor, 0);
      saidas += VENCIDOS.filter((v) => v.tipo === 'pagar').reduce((a, v) => a + v.valor, 0);
    }
    blocos.push({
      semana: `Sem ${i + 1}`,
      periodo: `${formatDia(isoFromOffset(ini))} – ${formatDia(isoFromOffset(fim))}`,
      entradas,
      saidas,
    });
    ini = fim + 1;
  }
  return blocos;
}

function serieRealizada(dias = 7): PontoFluxo[] {
  const pontos: PontoFluxo[] = [];
  for (let offset = -dias; offset < 0; offset++) {
    const posteriores = VENCIMENTOS.filter(
      (v) => v.offset > offset && v.offset <= 0 && (v.status === 'pago' || v.status === 'recebido'),
    );
    const delta = posteriores.reduce((a, v) => a + (v.tipo === 'receber' ? v.valor : -v.valor), 0);
    const doDia = VENCIMENTOS.filter(
      (v) => v.offset === offset && (v.status === 'pago' || v.status === 'recebido'),
    );
    pontos.push({
      offset,
      data: isoFromOffset(offset),
      saldo: Math.round(SALDO_ATUAL - delta),
      entradas: doDia.filter((v) => v.tipo === 'receber').reduce((a, v) => a + v.valor, 0),
      saidas: doDia.filter((v) => v.tipo === 'pagar').reduce((a, v) => a + v.valor, 0),
    });
  }
  return pontos;
}

function getDataset(horizonte: number): FluxoCaixaDataset {
  return {
    saldoAtual: SALDO_ATUAL,
    horizonte,
    resumo: resumoHorizonte(horizonte),
    blocos: blocosHorizonte(horizonte),
    serieRealizada: serieRealizada(7),
    vencimentos: VENCIMENTOS.filter((v) => v.offset <= horizonte),
    vencidos: VENCIDOS,
    sparksFluxo: SPARKS_FLUXO,
  };
}

@Injectable({ providedIn: 'root' })
export class FluxoCaixaService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly data = signal<FluxoCaixaDataset | null>(null);
  readonly loading = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Mesmo wrapper autenticado dos outros services (401 -> refresh + retry) — pronto pra quando o endpoint existir. */
  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (this.isUnauthorized(err)) {
        const refreshed = await this.auth.refresh();
        if (refreshed) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { response?: { status?: number } }).response?.status === 401
    );
  }

  /** TODO(API): sem endpoint de fluxo de caixa na mintly-lib ainda — mock local no mesmo formato de resposta ({ payload }). */
  private async fetch(horizonte: number): Promise<{ payload: FluxoCaixaDataset }> {
    await new Promise((r) => setTimeout(r, 380));
    return { payload: getDataset(horizonte) };
  }

  async refresh(horizonte: number): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.call(() => this.fetch(horizonte));
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
