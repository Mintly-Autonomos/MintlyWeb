import { PRICE_REVIEW_ALERT_DAYS } from 'mintly-lib';

/** Prato do cardápio, na forma que as telas usam. */
export interface Prato {
  id: string;
  name: string;
  category: string | null;
  price: number;
  /** Custo unitário (ingredientes e embalagem): base da margem. 0 = ainda não informado. */
  cost: number;
  /** Unidades vendidas por mês, informado pelo dono: base da popularidade. 0 = ainda não informado. */
  soldPerMonth: number;
  active: boolean;
  /** Última vez que o VALOR mudou. */
  priceUpdatedAt: string;
  /** Última revisão do preço (mudou o valor ou escolheu manter): base do aviso. */
  priceReviewedAt: string;
}

export type PratoAlerta = Prato & { daysSinceReview: number };

const DAY_MS = 86_400_000;
const DIAS_POR_MES = 30.4375;

/** Dias inteiros desde a última revisão do preço. */
export function diasSemRevisao(p: Pick<Prato, 'priceReviewedAt'>, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(p.priceReviewedAt).getTime()) / DAY_MS));
}

/** Mesma regra do servidor: prato ativo, 167+ dias sem revisar o preço. */
export function precisaRevisar(p: Prato, now: Date): boolean {
  return p.active && diasSemRevisao(p, now) >= PRICE_REVIEW_ALERT_DAYS;
}

/** "hoje", "há 12 dias", "há 1 mês", "há 5 meses". */
export function tempoLabel(dias: number): string {
  if (dias < 1) return 'hoje';
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const meses = Math.floor(dias / DIAS_POR_MES);
  return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

/** Meses inteiros parado, para o título do aviso ("sem reajuste há 5 meses"). */
export function mesesParado(dias: number): number {
  return Math.max(1, Math.floor(dias / DIAS_POR_MES));
}

const iso = (v: unknown): string => {
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

/** Entidade da lib (datas como string ISO ou Date) -> Prato. */
export function toPrato(raw: {
  _id?: string;
  id?: string;
  name: string;
  category?: string;
  price: number;
  cost?: number;
  soldPerMonth?: number;
  status: string;
  priceUpdatedAt: unknown;
  priceReviewedAt: unknown;
}): Prato {
  return {
    id: (raw._id ?? raw.id) as string,
    name: raw.name,
    category: raw.category ?? null,
    price: raw.price,
    cost: raw.cost ?? 0,
    soldPerMonth: raw.soldPerMonth ?? 0,
    active: raw.status === 'active',
    priceUpdatedAt: iso(raw.priceUpdatedAt),
    priceReviewedAt: iso(raw.priceReviewedAt),
  };
}

// ── Análise de cardápio (menu engineering, Kasavana & Smith, 1982) ─────────────────────────────

export type Quadrante = 'estrela' | 'cavalo' | 'quebraCabeca' | 'repensar';

export const ORDEM_QUADRANTES: Quadrante[] = ['estrela', 'cavalo', 'quebraCabeca', 'repensar'];

export const QUADRANTES: Record<
  Quadrante,
  {
    icon: string;
    label: string;
    explicacao: string;
    recomendacao: string;
    tone: 'mint' | 'ocean' | 'warning' | 'neutral';
    /** Cor do grupo no gráfico e nos ícones. */
    cor: string;
  }
> = {
  estrela: {
    icon: 'star',
    label: 'Melhores',
    explicacao:
      'Vendem acima da média e a margem por unidade também está acima da média. Origem: quadrante «Stars» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Vendem muito e lucram bem. Proteja: mantenha qualidade e destaque no cardápio.',
    tone: 'mint',
    cor: 'var(--success)',
  },
  cavalo: {
    icon: 'local_fire_department',
    label: 'Populares',
    explicacao:
      'Vendem acima da média, mas a margem por unidade fica abaixo da média. Origem: quadrante «Plowhorses» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Vendem muito, mas sobra pouco. Vale ajustar preço ou baratear o custo.',
    tone: 'ocean',
    cor: 'var(--ocean)',
  },
  quebraCabeca: {
    icon: 'diamond',
    label: 'Promissores',
    explicacao:
      'A margem por unidade está acima da média, mas vendem abaixo da média. Origem: quadrante «Puzzles» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Lucram bem, mas vendem pouco. Divulgue e sugira na venda.',
    tone: 'warning',
    cor: 'var(--warning)',
  },
  repensar: {
    icon: 'trending_down',
    label: 'Fracos',
    explicacao:
      'Vendem abaixo da média e a margem por unidade também. Origem: quadrante «Dogs» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Vendem pouco e lucram pouco. Vale repensar receita, preço ou tirar do cardápio.',
    tone: 'neutral',
    cor: 'var(--muted-foreground)',
  },
};

/** Prato na análise: com margem calculada para o preço em uso (o atual ou o simulado). */
export interface ItemAnalise {
  id: string;
  nome: string;
  categoria: string | null;
  qtd: number;
  preco: number;
  custo: number;
  /** Margem por unidade, em R$. */
  margem: number;
  margemPct: number;
  /** Preço cadastrado, para comparar com o simulado. */
  precoBase: number;
  alterado: boolean;
}

/** Só entra na análise o prato ativo com custo e vendidos informados (sem eles a margem e a popularidade não existem). */
export const analisavel = (p: Prato): boolean => p.active && p.cost > 0 && p.soldPerMonth > 0;

/** Prato ativo ao qual ainda falta custo ou vendidos no mês. */
export const incompleto = (p: Prato): boolean => p.active && !analisavel(p);

export function recalcular(p: Prato, preco: number): ItemAnalise {
  return {
    id: p.id,
    nome: p.name,
    categoria: p.category,
    qtd: p.soldPerMonth,
    preco,
    custo: p.cost,
    margem: preco - p.cost,
    margemPct: preco > 0 ? ((preco - p.cost) / preco) * 100 : 0,
    precoBase: p.price,
    alterado: Math.abs(preco - p.price) > 0.001,
  };
}

export interface AnaliseCardapio {
  itens: ItemAnalise[];
  mediaQtd: number;
  mediaMargemPct: number;
  grupos: Record<Quadrante, ItemAnalise[]>;
}

/** Quadrante de um item pelas médias: vende mais/menos que a média × margem % maior/menor que a média. */
export function quadranteDe(
  i: Pick<ItemAnalise, 'qtd' | 'margemPct'>,
  mediaQtd: number,
  mediaMargemPct: number,
): Quadrante {
  const pop = i.qtd >= mediaQtd;
  const mar = i.margemPct >= mediaMargemPct;
  if (pop && mar) return 'estrela';
  if (pop && !mar) return 'cavalo';
  if (!pop && mar) return 'quebraCabeca';
  return 'repensar';
}

/**
 * Classifica o cardápio. `precos` são preços simulados por id de prato: o prato simulado pode mudar de
 * grupo e, como as médias são recalculadas com os preços simulados, os outros também podem.
 */
export function analisar(pratos: Prato[], precos: Record<string, number> = {}): AnaliseCardapio {
  const itens = pratos.filter(analisavel).map((p) => recalcular(p, precos[p.id] ?? p.price));
  const n = itens.length || 1;
  const mediaQtd = itens.reduce((s, i) => s + i.qtd, 0) / n;
  const mediaMargemPct = itens.reduce((s, i) => s + i.margemPct, 0) / n;
  const grupos: Record<Quadrante, ItemAnalise[]> = {
    estrela: [],
    cavalo: [],
    quebraCabeca: [],
    repensar: [],
  };
  for (const i of itens) grupos[quadranteDe(i, mediaQtd, mediaMargemPct)].push(i);
  for (const k of ORDEM_QUADRANTES) grupos[k].sort((a, b) => b.qtd * b.margem - a.qtd * a.margem);
  return { itens, mediaQtd, mediaMargemPct, grupos };
}

/** Impacto no lucro do mês de trocar o preço, se o volume se mantiver. */
export function impactoMes(simulado: ItemAnalise, original: ItemAnalise): number {
  return (simulado.margem - original.margem) * simulado.qtd;
}

/** Faixa do controle de preço: de "custo + R$ 1" (ou preço − R$ 10) até preço + R$ 10, de R$ 0,50 em R$ 0,50. */
export function faixaPreco(p: Pick<Prato, 'price' | 'cost'>): {
  min: number;
  max: number;
  passo: number;
} {
  return { min: Math.max(p.cost + 1, p.price - 10), max: p.price + 10, passo: 0.5 };
}
