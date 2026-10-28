import { PRICE_REVIEW_ALERT_DAYS } from 'mintly-lib';

/** Prato do cardápio, na forma que as telas usam. */
export interface Prato {
  id: string;
  name: string;
  category: string | null;
  price: number;
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
  status: string;
  priceUpdatedAt: unknown;
  priceReviewedAt: unknown;
}): Prato {
  return {
    id: (raw._id ?? raw.id) as string,
    name: raw.name,
    category: raw.category ?? null,
    price: raw.price,
    active: raw.status === 'active',
    priceUpdatedAt: iso(raw.priceUpdatedAt),
    priceReviewedAt: iso(raw.priceReviewedAt),
  };
}
