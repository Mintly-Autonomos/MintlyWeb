import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { PeriodKey } from './receitas.service';

export type TipoDespesa = 'Fixo' | 'Variável' | 'Misto';

export interface Subitem {
  nome: string;
  valorMesAtual: number;
  valorMesAnterior: number;
  mediaUlt3Meses: number;
  tipo: 'fixo' | 'variavel';
}

export interface Despesa {
  categoria: string;
  valor: number;
  valorAnterior: number;
  tipo: TipoDespesa;
  icon: string;
  nota: string;
  subitens: Subitem[];
}

export interface Anomalia {
  categoria: string;
  subitem: string;
  valor: number;
  media: number;
  excedente: number;
  variacaoPct: number;
}

export interface CustosDataset {
  key: string;
  refLabel: string;
  comparacaoLabel: string;
  receita: number;
  despesas: Despesa[];
  total: number;
  totalAnterior: number;
  cmv: number;
  cmvPct: number;
  proLabore: number;
  primeCostPct: number;
  ifood: number;
  ifoodPct: number;
  deltas: { total: string; cmv: string; prime: string; ifood: string };
  deltasUp: { total: boolean; cmv: boolean; prime: boolean; ifood: boolean };
  sparks: { total: number[]; cmv: number[]; prime: number[]; ifood: number[] };
  fixosVariaveis: { tipo: TipoDespesa; valor: number }[];
  tendencia: {
    mes: string;
    total: number;
    cmv: number;
    proLabore: number;
    ifood: number;
    aluguel: number;
    utilidades: number;
    projecao?: boolean;
  }[];
  tendenciaTemProjecao: boolean;
  saltos: { mes: string; dataKey: string; label: string }[];
  anomalias: Anomalia[];
}

export const RECEITA_MES = 58400;
export const RECEITA_DELIVERY_MES = 26280;
export const TAXA_IFOOD_PCT = 23;

/** Parcela de cada categoria atribuível ao delivery (o resto é salão) — usado na tela pra dividir por canal. */
export const CANAL_DELIVERY: Record<string, number> = {
  'Taxa iFood': 1,
  'CMV / Insumos': 0.45,
  'Taxas de cartão': 0.35,
  Marketing: 0.6,
};

interface BaseCat {
  categoria: string;
  tipo: TipoDespesa;
  icon: string;
  nota: string;
  subitens: Subitem[];
}

const s = (
  nome: string,
  valorMesAtual: number,
  valorMesAnterior: number,
  mediaUlt3Meses: number,
  tipo: 'fixo' | 'variavel',
): Subitem => ({ nome, valorMesAtual, valorMesAnterior, mediaUlt3Meses, tipo });

const BASE_CATEGORIAS: BaseCat[] = [
  {
    categoria: 'CMV / Insumos',
    tipo: 'Variável',
    icon: 'shopping_basket',
    nota: 'Frango, óleo, molhos e embalagens',
    subitens: [
      s('Frango', 12500, 12200, 12300, 'variavel'),
      s('Óleo', 2800, 2700, 2720, 'variavel'),
      s('Molhos e temperos', 2100, 2050, 2060, 'variavel'),
      s('Embalagens', 2400, 1500, 1500, 'variavel'),
      s('Bebidas para revenda', 1224, 1180, 1200, 'variavel'),
    ],
  },
  {
    categoria: 'Pró-labore família',
    tipo: 'Fixo',
    icon: 'groups',
    nota: 'Retirada da família pelo trabalho no negócio',
    subitens: [s('Retirada família', 8000, 8000, 8000, 'fixo')],
  },
  {
    categoria: 'Taxa iFood',
    tipo: 'Variável',
    icon: 'delivery_dining',
    nota: 'Comissão de ~23% sobre o delivery',
    subitens: [s('Comissão iFood', 6044, 5200, 5350, 'variavel')],
  },
  {
    categoria: 'Aluguel',
    tipo: 'Fixo',
    icon: 'storefront',
    nota: 'Ponto comercial',
    subitens: [s('Aluguel do ponto', 6000, 6000, 6000, 'fixo')],
  },
  {
    categoria: 'Utilidades',
    tipo: 'Misto',
    icon: 'bolt',
    nota: 'Luz, gás e água',
    subitens: [
      s('Luz', 900, 870, 880, 'variavel'),
      s('Gás', 700, 480, 450, 'variavel'),
      s('Água', 400, 390, 395, 'fixo'),
    ],
  },
  {
    categoria: 'Taxas de cartão',
    tipo: 'Variável',
    icon: 'credit_card',
    nota: 'Maquininha e antecipação',
    subitens: [s('Maquininha e antecipação', 1200, 1160, 1170, 'variavel')],
  },
  {
    categoria: 'Contador / software',
    tipo: 'Fixo',
    icon: 'description',
    nota: 'Contabilidade e sistemas',
    subitens: [s('Contabilidade e sistemas', 1200, 1200, 1200, 'fixo')],
  },
  {
    categoria: 'Marketing',
    tipo: 'Variável',
    icon: 'campaign',
    nota: 'Anúncios e redes sociais',
    subitens: [s('Anúncios e redes sociais', 1000, 950, 960, 'variavel')],
  },
];

function pctTxt(atual: number, anterior: number): { text: string; up: boolean } {
  const p = anterior === 0 ? 0 : ((atual - anterior) / anterior) * 100;
  return { text: `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}%`, up: p >= 0 };
}

function ramp(v: number, fs = [0.82, 0.86, 0.9, 0.94, 0.97, 1]): number[] {
  return fs.map((f) => Math.round(v * f));
}

const MESES = ['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];

/** Subitens cujo valor atual está >30% acima da média dos últimos 3 meses. */
export function detectarAnomalias(despesas: Despesa[]): Anomalia[] {
  const out: Anomalia[] = [];
  for (const d of despesas) {
    for (const sub of d.subitens) {
      if (sub.mediaUlt3Meses <= 0) continue;
      const variacao = ((sub.valorMesAtual - sub.mediaUlt3Meses) / sub.mediaUlt3Meses) * 100;
      if (variacao > 30) {
        out.push({
          categoria: d.categoria,
          subitem: sub.nome,
          valor: sub.valorMesAtual,
          media: sub.mediaUlt3Meses,
          excedente: sub.valorMesAtual - sub.mediaUlt3Meses,
          variacaoPct: variacao,
        });
      }
    }
  }
  return out.sort((a, b) => b.excedente - a.excedente);
}

export function isAnomalo(sub: Subitem): boolean {
  return (
    sub.mediaUlt3Meses > 0 && (sub.valorMesAtual - sub.mediaUlt3Meses) / sub.mediaUlt3Meses > 0.3
  );
}

function build(
  key: string,
  refLabel: string,
  comparacaoLabel: string,
  fator: number,
  fatorAnterior: number,
  opts: { tendencia?: boolean } = {},
): CustosDataset {
  const r2 = (v: number) => Math.round(v * 100) / 100;

  const despesas: Despesa[] = BASE_CATEGORIAS.map((c) => {
    const subitens = c.subitens.map((sub) => ({
      ...sub,
      valorMesAtual: r2(sub.valorMesAtual * fator),
      valorMesAnterior: r2(sub.valorMesAnterior * fatorAnterior),
      mediaUlt3Meses: r2(sub.mediaUlt3Meses * fator),
    }));
    return {
      categoria: c.categoria,
      tipo: c.tipo,
      icon: c.icon,
      nota: c.nota,
      subitens,
      valor: r2(subitens.reduce((acc, x) => acc + x.valorMesAtual, 0)),
      valorAnterior: r2(subitens.reduce((acc, x) => acc + x.valorMesAnterior, 0)),
    };
  }).sort((a, b) => b.valor - a.valor);

  const receita = r2(RECEITA_MES * fator);
  const total = r2(despesas.reduce((acc, d) => acc + d.valor, 0));
  const totalAnterior = r2(despesas.reduce((acc, d) => acc + d.valorAnterior, 0));

  const find = (nome: string) => despesas.find((d) => d.categoria === nome)!;
  const cmvCat = find('CMV / Insumos');
  const proCat = find('Pró-labore família');
  const ifoodCat = find('Taxa iFood');

  const cmv = cmvCat.valor;
  const proLabore = proCat.valor;
  const ifood = ifoodCat.valor;

  const cmvPct = (cmv / receita) * 100;
  const primeCostPct = ((cmv + proLabore) / receita) * 100;
  const ifoodPct = (ifood / (RECEITA_DELIVERY_MES * fator)) * 100;

  const dTotal = pctTxt(total, totalAnterior);
  const dCmv = pctTxt(cmv, cmvCat.valorAnterior);
  const dPrime = pctTxt(cmv + proLabore, cmvCat.valorAnterior + proCat.valorAnterior);
  const dIfood = pctTxt(ifood, ifoodCat.valorAnterior);

  const tipos: TipoDespesa[] = ['Fixo', 'Variável', 'Misto'];
  const fixosVariaveis = tipos.map((t) => ({
    tipo: t,
    valor: r2(despesas.filter((d) => d.tipo === t).reduce((acc, d) => acc + d.valor, 0)),
  }));

  const comProjecao = opts.tendencia !== false;
  const fs = [0.88, 0.91, 0.94, 0.96, 0.98, 1];
  const tendencia = MESES.map((mes, i) => {
    const f = fs[i];
    const ultimo = i === MESES.length - 1;
    return {
      mes,
      total: Math.round(46468 * f),
      cmv: Math.round(ultimo ? 21024 : 20100 * f),
      proLabore: 8000,
      ifood: Math.round(ultimo ? 6044 : 5300 * f),
      aluguel: 6000,
      utilidades: Math.round(ultimo ? 2000 : 1750 * f),
      projecao: false,
    };
  });
  if (comProjecao) {
    tendencia.push({
      mes: 'Set',
      total: 47900,
      cmv: 21700,
      proLabore: 8000,
      ifood: 6300,
      aluguel: 6000,
      utilidades: 1900,
      projecao: true,
    });
  }

  const anomalias = detectarAnomalias(despesas);
  const saltos = comProjecao
    ? [
        { mes: 'Ago', dataKey: 'cmv', label: 'Embalagens subiram 60%' },
        { mes: 'Ago', dataKey: 'utilidades', label: 'Gás acima da média' },
      ]
    : [];

  return {
    key,
    refLabel,
    comparacaoLabel,
    receita,
    despesas,
    total,
    totalAnterior,
    cmv,
    cmvPct,
    proLabore,
    primeCostPct,
    ifood,
    ifoodPct,
    deltas: { total: dTotal.text, cmv: dCmv.text, prime: dPrime.text, ifood: dIfood.text },
    deltasUp: { total: dTotal.up, cmv: dCmv.up, prime: dPrime.up, ifood: dIfood.up },
    sparks: {
      total: ramp(total),
      cmv: ramp(cmv),
      prime: ramp(cmv + proLabore),
      ifood: ramp(ifood),
    },
    fixosVariaveis,
    tendencia,
    tendenciaTemProjecao: comProjecao,
    saltos,
    anomalias,
  };
}

const DATASETS: Record<Exclude<PeriodKey, 'Personalizado'>, CustosDataset> = {
  Hoje: build('hoje', 'Hoje · 05/08/2026', 'vs. ontem', 1 / 30, 1 / 31, { tendencia: false }),
  '7 dias': build('7d', 'Últimos 7 dias', 'vs. 7 dias anteriores', 7 / 30, 6.6 / 30, {
    tendencia: false,
  }),
  'Este mês': build('mes', 'Agosto/2026', 'vs. mês anterior', 1, 0.965),
  'Mês passado': build('mes-passado', 'Julho/2026', 'vs. junho/2026', 0.965, 0.93),
};

function getPeriodData(period: PeriodKey, from?: string, to?: string): CustosDataset {
  if (period !== 'Personalizado') return DATASETS[period];
  const start = from ? new Date(`${from}T00:00:00`) : null;
  const end = to ? new Date(`${to}T00:00:00`) : null;
  const dias =
    start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
      : 7;
  const fmt = (d: Date | null) =>
    d && !isNaN(d.getTime())
      ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '—';
  return build(
    `custom-${from}-${to}`,
    `${fmt(start)} a ${fmt(end)}`,
    'vs. período anterior',
    dias / 30,
    (dias * 0.95) / 30,
    { tendencia: dias >= 28 },
  );
}

@Injectable({ providedIn: 'root' })
export class CustosService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly data = signal<CustosDataset | null>(null);
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

  /** TODO(API): sem endpoint de custos na mintly-lib ainda — mock local no mesmo formato de resposta ({ payload }). */
  private async fetch(
    period: PeriodKey,
    from?: string,
    to?: string,
  ): Promise<{ payload: CustosDataset }> {
    await new Promise((r) => setTimeout(r, 380));
    return { payload: getPeriodData(period, from, to) };
  }

  async refresh(period: PeriodKey, from?: string, to?: string): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.call(() => this.fetch(period, from, to));
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
