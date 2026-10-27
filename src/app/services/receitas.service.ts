import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import mockReceitas from '../mocks/mock_receitas.json';

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

const CARDAPIO: ItemCardapio[] = mockReceitas.cardapio as ItemCardapio[];

const MATRIZ_MES: number[][] = mockReceitas.matrizMes;

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

const MESES_TENDENCIA = mockReceitas.mesesTendencia;
const P = mockReceitas.periodos;

const DATASET_ESTE_MES = build({
  ...P.esteMes,
  tendencia: MESES_TENDENCIA,
});

const DATASET_MES_PASSADO = build({
  ...P.mesPassado,
  tendencia: MESES_TENDENCIA.slice(0, 5),
});

const DATASET_7_DIAS = build({
  ...P.seteDias,
});

const DATASET_HOJE = build({
  ...P.hoje,
  heatmapFator: null,
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
