import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { WaterfallRow } from '../shared/waterfall-chart.component';
import type { InsightSeverity } from '../shared/insight-card.component';

export interface DashboardSummary {
  grossRevenue: number;
  prevGrossRevenue: number;
  taxes: number;
  netRevenue: number;
  cmv: number;
  cmvPct: number;
  prevCmvPct: number;
  opex: number;
  netProfit: number;
  prevNetProfit: number;
  marginPct: number;
  primeCost: number;
  primeCostPct: number;
  cashToday: number;
  cashIn30Days: number;
  healthScore: number;
}

export interface MonthlyPoint {
  month: string;
  receita: number;
  despesa: number;
  lucro: number;
}

export interface DashboardInsight {
  severity: InsightSeverity;
  title: string;
  description: string;
  action?: string;
}

export interface Pilar {
  key: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
}

export type NivelSaude = 'risco' | 'atencao' | 'saudavel';

export interface ScoreSaude {
  score: number;
  pilares: Pilar[];
  level: NivelSaude;
}

export interface DashboardDataset {
  referenceMonth: string;
  summary: DashboardSummary;
  monthlyHistory: MonthlyPoint[];
  waterfall: WaterfallRow[];
  sparks: { lucro: number[]; caixa: number[]; projecao: number[]; receita: number[] };
  insights: DashboardInsight[];
  saude: ScoreSaude;
  folegoDias: number;
}

const SUMMARY: DashboardSummary = {
  grossRevenue: 58400,
  prevGrossRevenue: 54200,
  taxes: 3504,
  netRevenue: 54896,
  cmv: 21024,
  cmvPct: 36,
  prevCmvPct: 33,
  opex: 27500,
  netProfit: 6372,
  prevNetProfit: 5100,
  marginPct: 10.9,
  primeCost: 36024,
  primeCostPct: 61.7,
  cashToday: 18500,
  cashIn30Days: 3900,
  healthScore: 74,
};

const MONTHLY_HISTORY: MonthlyPoint[] = [
  { month: 'Fev', receita: 44800, despesa: 40100, lucro: 4700 },
  { month: 'Mar', receita: 47300, despesa: 42600, lucro: 4700 },
  { month: 'Abr', receita: 49900, despesa: 44500, lucro: 5400 },
  { month: 'Mai', receita: 51600, despesa: 46700, lucro: 4900 },
  { month: 'Jun', receita: 54200, despesa: 49100, lucro: 5100 },
  { month: 'Jul', receita: 58400, despesa: 52028, lucro: 6372 },
];

const WATERFALL: WaterfallRow[] = [
  { label: 'Receita Bruta', value: 58400, kind: 'start' },
  { label: 'Impostos', value: -3504, kind: 'down' },
  { label: 'CMV', value: -21024, kind: 'down' },
  { label: 'Despesas', value: -27500, kind: 'down' },
  { label: 'Lucro Líquido', value: 6372, kind: 'end' },
];

const SPARKS = {
  lucro: [4700, 4700, 5400, 4900, 5100, 6372],
  caixa: [12100, 13800, 15200, 14600, 17100, 18500],
  projecao: [18500, 16200, 13400, 10100, 7200, 3900],
  receita: [44800, 47300, 49900, 51600, 54200, 58400],
};

const INSIGHTS: DashboardInsight[] = [
  {
    severity: 'atencao',
    title: 'Custo dos ingredientes acima do ideal',
    description:
      'O custo dos ingredientes subiu este mês e reduziu seu lucro em cerca de R$ 1.750.',
    action: 'Ver custos',
  },
  {
    severity: 'atencao',
    title: 'Caixa apertado a partir do dia 22',
    description:
      'Contas concentradas devem reduzir seu caixa para cerca de R$ 900 por volta do dia 22, com risco de faltar recurso para a operação.',
    action: 'Ver fluxo de caixa',
  },
  {
    severity: 'oportunidade',
    title: 'Oportunidade de margem na Moqueca',
    description:
      'A Moqueca tem alta procura e margem baixa. Um reajuste de cerca de R$ 4 no preço pode gerar aproximadamente R$ 640 a mais por mês.',
    action: 'Ver cardápio',
  },
  {
    severity: 'positivo',
    title: 'Ponto de equilíbrio atingido',
    description:
      'Desde o dia 19, suas contas fixas do mês já estão cobertas. As próximas vendas são lucro.',
  },
];

function scoreMargem(m: number): number {
  if (m < 0) return 0;
  if (m < 4) return 25;
  if (m < 8) return 50;
  if (m < 12) return 75;
  return 100;
}
function scorePrimeCost(p: number): number {
  if (p <= 60) return 100;
  if (p <= 65) return 75;
  if (p <= 70) return 50;
  return 25;
}
function scoreFolego(d: number): number {
  if (d >= 60) return 100;
  if (d >= 30) return 75;
  if (d >= 15) return 50;
  return 25;
}
function scoreTendencia(variacaoPct: number): number {
  if (variacaoPct > 2) return 100;
  if (variacaoPct >= -2) return 60;
  return 25;
}

function folegoDeCaixaDias(): number {
  return Math.round(SUMMARY.cashToday / (SUMMARY.opex / 30));
}

function calcularScoreSaude(): ScoreSaude {
  const margem = SUMMARY.marginPct;
  const prime = SUMMARY.primeCostPct;
  const folegoDias = SUMMARY.cashToday / (SUMMARY.opex / 30);
  const prevReceita =
    SUMMARY.prevGrossRevenue ||
    MONTHLY_HISTORY[MONTHLY_HISTORY.length - 2]?.receita ||
    SUMMARY.grossRevenue;
  const variacao = ((SUMMARY.grossRevenue - prevReceita) / prevReceita) * 100;

  const pilares: Pilar[] = [
    {
      key: 'margem',
      label: 'Margem líquida',
      weight: 30,
      score: scoreMargem(margem),
      detail: `${margem.toFixed(1).replace('.', ',')}% de margem`,
    },
    {
      key: 'prime',
      label: 'Prime Cost',
      weight: 25,
      score: scorePrimeCost(prime),
      detail: `${prime.toFixed(1).replace('.', ',')}% da receita`,
    },
    {
      key: 'folego',
      label: 'Fôlego de caixa',
      weight: 25,
      score: scoreFolego(folegoDias),
      detail: `~${Math.round(folegoDias)} dias de caixa`,
    },
    {
      key: 'tendencia',
      label: 'Tendência de vendas',
      weight: 20,
      score: scoreTendencia(variacao),
      detail: `${variacao > 0 ? '+' : ''}${variacao.toFixed(1).replace('.', ',')}% vs. mês anterior`,
    },
  ];

  const score = Math.round(pilares.reduce((acc, p) => acc + (p.score * p.weight) / 100, 0));
  return { score, pilares, level: score >= 70 ? 'saudavel' : score >= 50 ? 'atencao' : 'risco' };
}

function buildDataset(): DashboardDataset {
  return {
    referenceMonth: 'Julho/2026',
    summary: SUMMARY,
    monthlyHistory: MONTHLY_HISTORY,
    waterfall: WATERFALL,
    sparks: SPARKS,
    insights: INSIGHTS,
    saude: calcularScoreSaude(),
    folegoDias: folegoDeCaixaDias(),
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly data = signal<DashboardDataset | null>(null);
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

  /** TODO(API): sem endpoint de dashboard/visão-geral na mintly-lib ainda — mock local no mesmo formato de resposta ({ payload }). */
  private async fetch(): Promise<{ payload: DashboardDataset }> {
    await new Promise((r) => setTimeout(r, 380));
    return { payload: buildDataset() };
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.call(() => this.fetch());
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
