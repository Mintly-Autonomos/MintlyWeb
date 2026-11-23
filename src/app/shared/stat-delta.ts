import type { ReportComparison } from 'mintly-lib';
import type { StatDelta } from './stat-card.component';
import { fmtMonthLong, formatBRL } from './format';

/** Abaixo disso (em %, ou em p.p.) a variação é tratada como "sem alteração". */
const FLAT_BELOW = 0.05;

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Acima disto (300%) a variação em % deixa de ajudar a ler: mostra a diferença em reais. */
const PCT_MAX = 3;

/**
 * Variação de um indicador para o `app-stat-card`.
 * - Sem dado (`null`, `undefined`, NaN): devolve `null` e o card não mostra a linha, em vez de uma
 *   legenda sem número.
 * - Sem alteração: `flat`, que o card mostra neutro (nem verde, nem vermelho).
 * - `points`: o valor já está em pontos percentuais; senão é uma fração (0,2 = 20%).
 */
export function statDelta(
  value: number | null | undefined,
  opts: {
    note?: string;
    points?: boolean;
    /**
     * Valor atual e a base da comparação. Com a base negativa ou a variação acima de 300%, a % não diz nada
     * ("+34.399,4%" sobre −R$ 42,10): mostra a diferença em reais e, em `lucro`, "virou lucro"/"virou prejuízo".
     */
    base?: { current: number; previous: number | null | undefined; lucro?: boolean };
  } = {},
): StatDelta | null {
  const b = opts.base;
  if (b && b.previous != null && Number.isFinite(b.previous) && !opts.points) {
    const prev = b.previous;
    const pctInutil =
      prev < 0 || (value != null && Number.isFinite(value) && Math.abs(value) > PCT_MAX);
    if (pctInutil) {
      const diff = Math.round((b.current - prev) * 100) / 100;
      if (diff === 0) return { value: formatBRL(0), up: false, flat: true, note: opts.note };
      const virou =
        b.lucro && prev < 0 && b.current >= 0
          ? 'virou lucro'
          : b.lucro && prev >= 0 && b.current < 0
            ? 'virou prejuízo'
            : '';
      const note = [opts.note, virou].filter(Boolean).join(' · ') || undefined;
      return { value: formatBRL(Math.abs(diff)), up: diff > 0, note };
    }
  }
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const n = opts.points ? value : value * 100;
  const unit = opts.points ? ' p.p.' : '%';
  if (Math.abs(n) < FLAT_BELOW)
    return { value: `0${unit}`, up: false, flat: true, note: opts.note };
  return { value: `${fmt(Math.abs(n))}${unit}`, up: n > 0, note: opts.note };
}

/** "2026-11" -> "2026-10". */
function mesAnterior(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Legenda das variações. No mês em andamento a API compara os mesmos dias do mês anterior
 * (`samePeriod`, dias 1 a `untilDay`): a legenda diz isso em vez de "vs. mês anterior", que fazia
 * parecer que 4 dias de novembro estavam sendo comparados com outubro inteiro.
 */
export function comparisonNote(
  comparison: ReportComparison | null | undefined,
  referenceMonth: string,
): string {
  const anterior = fmtMonthLong(mesAnterior(referenceMonth));
  if (comparison?.kind === 'samePeriod' && comparison.untilDay) {
    const dias = comparison.untilDay === 1 ? 'dia 1' : `dias 1 a ${comparison.untilDay}`;
    return `vs. ${dias} de ${anterior}`;
  }
  return `vs. ${anterior}`;
}

/**
 * Base da comparação por extenso, para frases: "aos dias 1 a 22 de Outubro/2026" no mês em andamento (a API compara
 * os mesmos dias) ou "a Outubro/2026" no mês fechado. Sem isso, "cresceu R$ 8.826 em relação a Outubro" fazia parecer
 * que o mês era melhor que outubro inteiro (reteste 22/11).
 */
export function comparisonBase(
  comparison: ReportComparison | null | undefined,
  referenceMonth: string,
): string {
  const anterior = fmtMonthLong(mesAnterior(referenceMonth));
  if (comparison?.kind === 'samePeriod' && comparison.untilDay) {
    return comparison.untilDay === 1
      ? `ao dia 1 de ${anterior}`
      : `aos dias 1 a ${comparison.untilDay} de ${anterior}`;
  }
  return `a ${anterior}`;
}

/** Selo de mês parcial: "Mês parcial: até o dia 4". Mês fechado não tem selo (null). */
export function partialMonthLabel(comparison: ReportComparison | null | undefined): string | null {
  if (comparison?.kind !== 'samePeriod' || !comparison.untilDay) return null;
  return `Mês parcial: até o dia ${comparison.untilDay}`;
}
