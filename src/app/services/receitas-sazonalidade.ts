import type { Canal, ReceitaMov } from './receitas.builder';

/**
 * "Sazonalidade por canal" (relatório Sweetie Bel, P.2 / seção 12.3). Pura (testada sem tela).
 *
 * Os 12 meses até o mês de `fim`, com as vendas de cada canal pelo dia da VENDA, e o índice sazonal de cada mês:
 *   índice = vendas do mês ÷ média mensal dos meses com histórico (até 12)
 *   > 1,15 = alta temporada | < 0,85 = baixa temporada
 * A média começa no primeiro mês com venda, para que meses antes do início do uso não puxem a média para baixo.
 * Com menos de 3 meses de histórico, não há índice. Se o período termina no meio do mês (ex.: "Este mês"), o último
 * mês está incompleto: aparece nas barras, mas fica fora da média e sem índice (senão viraria uma falsa baixa).
 */

export type Temporada = 'alta' | 'baixa' | 'normal';

export interface MesSazonal {
  /** "Dez/25" */
  mes: string;
  salao: number;
  delivery: number;
  encomendas: number;
  total: number;
  /** null: mês antes do início do histórico, mês ainda em andamento, ou histórico curto demais. */
  indice: number | null;
  /** O período termina no meio deste mês: ele aparece, mas fica fora da média e sem índice. */
  parcial: boolean;
  temporada: Temporada | null;
}

export interface Sazonalidade {
  meses: MesSazonal[];
  /** Meses com histórico dentro dos 12 (do primeiro mês com venda até o fim). */
  mesesComHistorico: number;
  mediaMensal: number;
  /** Texto curto para a tela ("Dez é alta temporada (1,29×)…"); vazio quando não há índice. */
  resumo: string;
}

export const ALTA = 1.15;
export const BAIXA = 0.85;
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const money = (n: number) => Math.round(n * 100) / 100;
const chave = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
const fmtIndice = (n: number) => `${n.toFixed(2).replace('.', ',')}×`;

export function temporadaDe(indice: number): Temporada {
  if (indice > ALTA) return 'alta';
  if (indice < BAIXA) return 'baixa';
  return 'normal';
}

export function sazonalidadePorCanal(movs: ReceitaMov[], fim: string): Sazonalidade {
  const soma = new Map<string, Record<Canal, number>>();
  let primeiro: string | null = null;
  for (const m of movs) {
    const k = (m.saleDate ?? m.date).slice(0, 7);
    const s = soma.get(k) ?? { salao: 0, delivery: 0, encomendas: 0 };
    s[m.canal] += m.gross;
    soma.set(k, s);
    if (m.gross > 0 && (!primeiro || k < primeiro)) primeiro = k;
  }

  const [y, mo, dia] = fim.split('-').map(Number);
  const ultimoParcial = dia < new Date(y, mo, 0).getDate();
  const base = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    const k = chave(d.getFullYear(), d.getMonth());
    const s = soma.get(k) ?? { salao: 0, delivery: 0, encomendas: 0 };
    base.push({
      k,
      mes: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      salao: money(s.salao),
      delivery: money(s.delivery),
      encomendas: money(s.encomendas),
      total: money(s.salao + s.delivery + s.encomendas),
      parcial: i === 0 && ultimoParcial,
    });
  }

  const comHistorico = base.filter((b) => primeiro !== null && b.k >= primeiro && !b.parcial);
  const mediaMensal = comHistorico.length
    ? money(comHistorico.reduce((a, b) => a + b.total, 0) / comHistorico.length)
    : 0;
  const temIndice = comHistorico.length >= 3 && mediaMensal > 0;

  const meses: MesSazonal[] = base.map(({ k, ...b }) => {
    if (!temIndice || primeiro === null || k < primeiro || b.parcial)
      return { ...b, indice: null, temporada: null };
    const indice = Math.round((b.total / mediaMensal) * 100) / 100;
    return { ...b, indice, temporada: temporadaDe(indice) };
  });

  let resumo = '';
  if (temIndice) {
    const altas = meses.filter((m) => m.temporada === 'alta');
    const baixas = meses.filter((m) => m.temporada === 'baixa');
    const lista = (ms: MesSazonal[]) =>
      ms.map((m) => `${m.mes.slice(0, 3)} (${fmtIndice(m.indice!)})`).join(', ');
    const partes = [];
    if (altas.length) partes.push(`Alta temporada: ${lista(altas)}`);
    if (baixas.length) partes.push(`baixa: ${lista(baixas)}`);
    resumo = partes.length
      ? `${partes.join('; ')}.`
      : 'Nenhum mês fugiu mais de 15% da média: as vendas estão estáveis ao longo do ano.';
  }

  return { meses, mesesComHistorico: comHistorico.length, mediaMensal, resumo };
}
