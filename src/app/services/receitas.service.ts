import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type PeriodKey = 'Hoje' | '7 dias' | 'Este mês' | 'Mês passado' | 'Personalizado';
export type Canal = 'salao' | 'delivery';
export type CategoriaMenu = 'Frango' | 'Acompanhamentos' | 'Bebidas' | 'Combos';

export interface ItemCardapio {
  nome: string;
  categoria: CategoriaMenu;
  canalPrincipal: Canal;
  preco: number;
  custo: number;
  qtd: number;
}

export interface ReceitasDataset {
  key: string;
  refLabel: string;
  comparacaoLabel: string;
  receitaBruta: number;
  impostos: number;
  receitaLiquida: number;
  pedidos: number;
  ticketMedio: number;
  deltas: { receitaBruta: string; receitaLiquida: string; ticketMedio: string; pedidos: string };
  deltasUp: {
    receitaBruta: boolean;
    receitaLiquida: boolean;
    ticketMedio: boolean;
    pedidos: boolean;
  };
  sparks: {
    receitaBruta: number[];
    receitaLiquida: number[];
    ticketMedio: number[];
    pedidos: number[];
  };
  waterfall: { label: string; value: number; kind: 'start' | 'down' | 'end' }[];
  itens: (ItemCardapio & { receita: number; margemPct: number })[];
  porCategoria: { categoria: CategoriaMenu; receita: number }[];
  canais: { canal: string; receita: number; liquida: number; nota: string }[];
  formasPagamento: { forma: string; valor: number }[];
  heatmap: { dia: string; faixa: string; valor: number }[] | null;
  heatmapMax: number;
  heatmapVazioMsg?: string;
  tendencia: { mes: string; total: number; salao: number; delivery: number }[];
  tendenciaDescricao: string;
  pedidosLabel: string;
}

export const FAIXAS = ['Manhã', 'Almoço', 'Tarde', 'Noite'] as const;
export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
export const TAXA_DELIVERY_PCT = 23;

const CARDAPIO: ItemCardapio[] = [
  {
    nome: 'Frango Yangnyeom (agridoce apimentado)',
    categoria: 'Frango',
    canalPrincipal: 'delivery',
    preco: 79.9,
    custo: 30.4,
    qtd: 118,
  },
  {
    nome: 'Frango Soy Garlic (shoyu e alho)',
    categoria: 'Frango',
    canalPrincipal: 'salao',
    preco: 79.9,
    custo: 30.0,
    qtd: 104,
  },
  {
    nome: 'Frango Original',
    categoria: 'Frango',
    canalPrincipal: 'salao',
    preco: 72.9,
    custo: 27.2,
    qtd: 96,
  },
  {
    nome: 'Frango Honey Butter',
    categoria: 'Frango',
    canalPrincipal: 'delivery',
    preco: 82.9,
    custo: 32.5,
    qtd: 62,
  },
  {
    nome: 'Combo Casal (balde + 2 bebidas)',
    categoria: 'Combos',
    canalPrincipal: 'salao',
    preco: 129.9,
    custo: 49.8,
    qtd: 48,
  },
  {
    nome: 'Combo Frango + Bebida',
    categoria: 'Combos',
    canalPrincipal: 'delivery',
    preco: 89.9,
    custo: 34.6,
    qtd: 66,
  },
  {
    nome: 'Coxinha de frango',
    categoria: 'Acompanhamentos',
    canalPrincipal: 'salao',
    preco: 9.9,
    custo: 3.4,
    qtd: 210,
  },
  {
    nome: 'Kimchi',
    categoria: 'Acompanhamentos',
    canalPrincipal: 'salao',
    preco: 16.9,
    custo: 5.6,
    qtd: 118,
  },
  {
    nome: 'Arroz',
    categoria: 'Acompanhamentos',
    canalPrincipal: 'salao',
    preco: 11.9,
    custo: 3.1,
    qtd: 146,
  },
  {
    nome: 'Cerveja',
    categoria: 'Bebidas',
    canalPrincipal: 'salao',
    preco: 14.9,
    custo: 4.6,
    qtd: 386,
  },
  {
    nome: 'Soju',
    categoria: 'Bebidas',
    canalPrincipal: 'salao',
    preco: 29.9,
    custo: 9.2,
    qtd: 168,
  },
];

const MATRIZ_MES: number[][] = [
  [0, 380, 260, 1450],
  [0, 420, 290, 1620],
  [0, 460, 310, 1980],
  [0, 510, 340, 2460],
  [0, 620, 420, 4980],
  [0, 880, 660, 6240],
  [0, 940, 720, 4360],
];

const CATEGORIAS: CategoriaMenu[] = ['Frango', 'Combos', 'Acompanhamentos', 'Bebidas'];
const BRUTO_CARDAPIO = CARDAPIO.reduce((s, i) => s + i.preco * i.qtd, 0);

function pct(atual: number, anterior: number): { text: string; up: boolean } {
  const p = anterior === 0 ? 0 : ((atual - anterior) / anterior) * 100;
  return { text: `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}%`, up: p >= 0 };
}

function ramp(v: number): number[] {
  return [0.78, 0.83, 0.87, 0.91, 0.95, 1].map((f) => Math.round(v * f * 100) / 100);
}

interface BuildOpts {
  key: string;
  refLabel: string;
  comparacaoLabel: string;
  bruta: number;
  pedidos: number;
  brutaPrev: number;
  pedidosPrev: number;
  heatmapFator: number | null;
  heatmapVazioMsg?: string;
  tendencia: { mes: string; total: number }[];
  tendenciaDescricao: string;
  pedidosLabel: string;
}

function build(opts: BuildOpts): ReceitasDataset {
  const bruta = Math.round(opts.bruta);
  const impostos = Math.round(bruta * 0.06);
  const liquida = bruta - impostos;
  const ticket = bruta / opts.pedidos;
  const ticketPrev = opts.brutaPrev / opts.pedidosPrev;
  const escala = bruta / BRUTO_CARDAPIO;

  const itens = CARDAPIO.map((i) => ({
    ...i,
    qtd: Math.max(1, Math.round(i.qtd * escala)),
    receita: Math.round(i.preco * i.qtd * escala),
    margemPct: ((i.preco - i.custo) / i.preco) * 100,
  })).sort((a, b) => b.receita - a.receita);

  const receitaSalao = Math.round(bruta * 0.55);
  const receitaDelivery = bruta - receitaSalao;

  const dB = pct(bruta, opts.brutaPrev);
  const dL = pct(liquida, Math.round(opts.brutaPrev * 0.94));
  const dT = pct(ticket, ticketPrev);
  const dP = pct(opts.pedidos, opts.pedidosPrev);

  const heat =
    opts.heatmapFator == null
      ? null
      : DIAS_SEMANA.flatMap((dia, i) =>
          FAIXAS.map((faixa, j) => ({
            dia,
            faixa,
            valor: Math.round(MATRIZ_MES[i][j] * opts.heatmapFator!),
          })),
        );

  return {
    key: opts.key,
    refLabel: opts.refLabel,
    comparacaoLabel: opts.comparacaoLabel,
    receitaBruta: bruta,
    impostos,
    receitaLiquida: liquida,
    pedidos: opts.pedidos,
    ticketMedio: ticket,
    deltas: {
      receitaBruta: dB.text,
      receitaLiquida: dL.text,
      ticketMedio: dT.text,
      pedidos: dP.text,
    },
    deltasUp: { receitaBruta: dB.up, receitaLiquida: dL.up, ticketMedio: dT.up, pedidos: dP.up },
    sparks: {
      receitaBruta: ramp(bruta),
      receitaLiquida: ramp(liquida),
      ticketMedio: ramp(ticket),
      pedidos: ramp(opts.pedidos),
    },
    waterfall: [
      { label: 'Receita bruta', value: bruta, kind: 'start' },
      { label: 'Impostos s/ venda', value: -impostos, kind: 'down' },
      { label: 'Receita líquida', value: liquida, kind: 'end' },
    ],
    itens,
    porCategoria: CATEGORIAS.map((c) => ({
      categoria: c,
      receita: itens.filter((i) => i.categoria === c).reduce((s, i) => s + i.receita, 0),
    })),
    canais: [
      {
        canal: 'Salão',
        receita: receitaSalao,
        liquida: Math.round(receitaSalao * 0.94),
        nota: 'Sem taxas de marketplace',
      },
      {
        canal: 'Delivery',
        receita: receitaDelivery,
        liquida: Math.round(receitaDelivery * (1 - TAXA_DELIVERY_PCT / 100) * 0.94),
        nota: `Após taxas do iFood (~${TAXA_DELIVERY_PCT}%)`,
      },
    ],
    formasPagamento: [
      { forma: 'Pix', valor: Math.round(bruta * 0.38) },
      { forma: 'Cartão', valor: Math.round(bruta * 0.47) },
      { forma: 'Dinheiro', valor: bruta - Math.round(bruta * 0.38) - Math.round(bruta * 0.47) },
    ],
    heatmap: heat,
    heatmapMax: heat ? Math.max(...heat.map((h) => h.valor)) : 0,
    heatmapVazioMsg: opts.heatmapVazioMsg,
    tendencia: opts.tendencia.map((t) => ({
      mes: t.mes,
      total: t.total,
      salao: Math.round(t.total * 0.55),
      delivery: t.total - Math.round(t.total * 0.55),
    })),
    tendenciaDescricao: opts.tendenciaDescricao,
    pedidosLabel: opts.pedidosLabel,
  };
}

const MESES_TENDENCIA = [
  { mes: 'Fev', total: 46200 },
  { mes: 'Mar', total: 48900 },
  { mes: 'Abr', total: 50400 },
  { mes: 'Mai', total: 52800 },
  { mes: 'Jun', total: 54200 },
  { mes: 'Jul', total: 58400 },
];

const DATASET_ESTE_MES = build({
  key: 'Este mês',
  refLabel: 'Julho/2026',
  comparacaoLabel: 'vs. mês anterior',
  bruta: 58400,
  pedidos: 1042,
  brutaPrev: 54200,
  pedidosPrev: 985,
  heatmapFator: 1,
  tendencia: MESES_TENDENCIA,
  tendenciaDescricao: 'Últimos 6 meses',
  pedidosLabel: 'Pedidos no mês',
});

const DATASET_MES_PASSADO = build({
  key: 'Mês passado',
  refLabel: 'Junho/2026',
  comparacaoLabel: 'vs. mês anterior',
  bruta: 54200,
  pedidos: 985,
  brutaPrev: 52800,
  pedidosPrev: 968,
  heatmapFator: 54200 / 58400,
  tendencia: MESES_TENDENCIA.slice(0, 5),
  tendenciaDescricao: 'Últimos 5 meses até Junho',
  pedidosLabel: 'Pedidos no mês',
});

const DATASET_7_DIAS = build({
  key: '7 dias',
  refLabel: '01–07/Jul/2026',
  comparacaoLabel: 'vs. 7 dias anteriores',
  bruta: 13600,
  pedidos: 243,
  brutaPrev: 12750,
  pedidosPrev: 231,
  heatmapFator: 1 / 4.3,
  tendencia: [
    { mes: 'Seg', total: 1290 },
    { mes: 'Ter', total: 1410 },
    { mes: 'Qua', total: 1680 },
    { mes: 'Qui', total: 1980 },
    { mes: 'Sex', total: 2640 },
    { mes: 'Sáb', total: 3020 },
    { mes: 'Dom', total: 1580 },
  ],
  tendenciaDescricao: 'Dia a dia dos últimos 7 dias',
  pedidosLabel: 'Pedidos no período',
});

const DATASET_HOJE = build({
  key: 'Hoje',
  refLabel: 'Hoje · 07/Jul/2026',
  comparacaoLabel: 'vs. ontem',
  bruta: 2180,
  pedidos: 39,
  brutaPrev: 2040,
  pedidosPrev: 37,
  heatmapFator: null,
  heatmapVazioMsg:
    'O padrão semanal precisa de pelo menos uma semana de vendas. Escolha "7 dias" ou "Este mês".',
  tendencia: [
    { mes: '11h', total: 120 },
    { mes: '13h', total: 340 },
    { mes: '15h', total: 180 },
    { mes: '18h', total: 420 },
    { mes: '20h', total: 780 },
    { mes: '22h', total: 340 },
  ],
  tendenciaDescricao: 'Vendas por horário de hoje',
  pedidosLabel: 'Pedidos hoje',
});

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function getPeriodData(period: PeriodKey, from?: string, to?: string): ReceitasDataset {
  switch (period) {
    case 'Hoje':
      return DATASET_HOJE;
    case '7 dias':
      return DATASET_7_DIAS;
    case 'Mês passado':
      return DATASET_MES_PASSADO;
    case 'Personalizado': {
      if (!from || !to) return DATASET_ESTE_MES;
      const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime();
      const dias = Math.max(1, Math.round(ms / 86400000) + 1);
      const diaria = 58400 / 30;
      const bruta = diaria * dias;
      const pedidos = Math.max(1, Math.round((1042 / 30) * dias));
      const semanas = Math.max(1, Math.min(6, Math.ceil(dias / 7)));
      return build({
        key: `custom-${from}-${to}`,
        refLabel: `${fmtData(from)} – ${fmtData(to)}`,
        comparacaoLabel: 'vs. período anterior equivalente',
        bruta,
        pedidos,
        brutaPrev: bruta * 0.93,
        pedidosPrev: Math.max(1, Math.round(pedidos * 0.95)),
        heatmapFator: dias >= 7 ? dias / 30 : null,
        heatmapVazioMsg:
          'Selecione um intervalo de pelo menos 7 dias para ver o padrão por dia da semana.',
        tendencia: Array.from({ length: semanas }, (_, i) => ({
          mes: `Sem ${i + 1}`,
          total: Math.round((bruta / semanas) * (0.88 + i * 0.05)),
        })),
        tendenciaDescricao: `Semana a semana (${dias} dias)`,
        pedidosLabel: 'Pedidos no período',
      });
    }
    case 'Este mês':
    default:
      return DATASET_ESTE_MES;
  }
}

@Injectable({ providedIn: 'root' })
export class ReceitasService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly data = signal<ReceitasDataset | null>(null);
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

  /**
   * TODO(API): não existe endpoint de receitas na mintly-lib ainda (só
   * Auth/FinancialAccount/FinancialCategory/FinancialMovement/Person/Restaurant clients).
   * Por ora devolve um mock local no mesmo formato de resposta ({ payload }) — quando o
   * endpoint existir, troque só o corpo de `fetch` abaixo por uma chamada real ao client.
   */
  private async fetch(
    period: PeriodKey,
    from?: string,
    to?: string,
  ): Promise<{ payload: ReceitasDataset }> {
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
