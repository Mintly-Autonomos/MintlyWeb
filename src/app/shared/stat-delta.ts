import type { ReportComparison } from 'mintly-lib';
import type { StatDelta } from './stat-card.component';
import { fmtMonthLong } from './format';

/** Abaixo disso (em %, ou em p.p.) a variação é tratada como "sem alteração". */
const FLAT_BELOW = 0.05;

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Variação de um indicador para o `app-stat-card`.
 * - Sem dado (`null`, `undefined`, NaN): devolve `null` e o card não mostra a linha, em vez de uma
 *   legenda sem número.
 * - Sem alteração: `flat`, que o card mostra neutro (nem verde, nem vermelho).
 * - `points`: o valor já está em pontos percentuais; senão é uma fração (0,2 = 20%).
 */
export function statDelta(
  value: number | null | undefined,
  opts: { note?: string; points?: boolean } = {},
): StatDelta | null {
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

/** Selo de mês parcial: "Mês parcial: até o dia 4". Mês fechado não tem selo (null). */
export function partialMonthLabel(comparison: ReportComparison | null | undefined): string | null {
  if (comparison?.kind !== 'samePeriod' || !comparison.untilDay) return null;
  return `Mês parcial: até o dia ${comparison.untilDay}`;
}
