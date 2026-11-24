import type { ResultReport } from 'mintly-lib';

/**
 * Imposto sobre a venda que Receitas e Previsões aplicam, tirado do Resultado do mês (reteste 22/11, T1): o MESMO
 * imposto nas três telas.
 * - Simples: a alíquota efetiva do regime (fração da venda);
 * - MEI: o DAS é um valor FIXO por mês, não uma porcentagem. Antes as telas faziam "imposto ÷ receita do mês" e
 *   aplicavam essa fração: com 2 DAS pagos no mês e poucas vendas, Receitas mostrava 56% e as Previsões 78%.
 */
export interface ImpostoMes {
  /** Fração da venda (Simples). 0 no MEI. */
  aliquota: number;
  /** DAS do mês (MEI). 0 no Simples. */
  fixoMes: number;
}

export const SEM_IMPOSTO: ImpostoMes = { aliquota: 0, fixoMes: 0 };

export function impostoDoResultado(
  r: Pick<ResultReport, 'tax' | 'current'> | null | undefined,
): ImpostoMes {
  if (!r) return SEM_IMPOSTO;
  if (r.tax?.regime === 'mei') return { aliquota: 0, fixoMes: Math.max(0, r.current.taxes) };
  if (r.tax?.effectiveRate != null) return { aliquota: r.tax.effectiveRate, fixoMes: 0 };
  const cur = r.current;
  return { aliquota: cur && cur.grossRevenue > 0 ? cur.taxes / cur.grossRevenue : 0, fixoMes: 0 };
}

/**
 * Acima disto o "DAS-MEI" do mês não parece guia de MEI (sugestão da testadora, 23/11). O DAS-MEI é 5% do salário
 * mínimo mais R$ 1 de ICMS e/ou R$ 5 de ISS: em 2026, perto de R$ 82 a R$ 87. R$ 150 dá folga para os próximos
 * reajustes. Uma guia de R$ 2.248 (27 vezes maior) costuma ser do Simples Nacional: regime errado ou guia de outro
 * imposto lançada como DAS.
 */
export const DAS_MEI_MAXIMO_PLAUSIVEL = 150;

/** O DAS do MEI que o Resultado usa está fora do que um DAS-MEI pode valer. */
export function dasMeiImplausivel(tax: {
  regime: string | null;
  meiMonthlyDas: number | null;
}): boolean {
  return tax.regime === 'mei' && (tax.meiMonthlyDas ?? 0) > DAS_MEI_MAXIMO_PLAUSIVEL;
}

const diaDoMes = (s: string) => Number(s.slice(8, 10));
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86_400_000) + 1;

/**
 * O DAS fixo que cabe numa janela de datas (AAAA-MM-DD). Janela de um mês do calendário (do dia 1 até no máximo o
 * fim dele, como "Este mês" e "Mês passado"): o DAS do mês inteiro, como o Resultado. Outras janelas (7 dias,
 * 30 dias, personalizada): proporcional aos dias (DAS ÷ 30 por dia).
 */
export function impostoFixoNaJanela(fixoMes: number, inicio: string, fim: string): number {
  if (!(fixoMes > 0) || fim < inicio) return 0;
  if (diaDoMes(inicio) === 1 && inicio.slice(0, 7) === fim.slice(0, 7)) return fixoMes;
  return Math.round(((fixoMes * diasEntre(inicio, fim)) / 30) * 100) / 100;
}
