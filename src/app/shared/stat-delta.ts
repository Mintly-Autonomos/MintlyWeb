import type { StatDelta } from './stat-card.component';

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
