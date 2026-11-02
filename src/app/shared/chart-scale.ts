/** Eixo de valores já arredondado para números "redondos" (0, 50, 100…), pronto para desenhar. */
export interface ChartScale {
  min: number;
  max: number;
  step: number;
}

/** Degrau redondo (1, 2, 2,5, 5 × 10^n) que cobre `[min, max]` em torno de `count` divisões. */
export function niceScale(min: number, max: number, count = 4): ChartScale {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min)
    return { min: 0, max: 1, step: 0.25 };
  if (min === max) {
    const pad = Math.abs(max) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const base = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / base;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = nice * base;
  // 1e-9: evita que 300 / 100 = 3.0000000000000004 empurre o limite um degrau para fora.
  return {
    min: Math.floor(min / step + 1e-9) * step,
    max: Math.ceil(max / step - 1e-9) * step,
    step,
  };
}

/**
 * Eixo para os valores de um gráfico. Aceita negativos.
 * - `always` (barras): o zero sempre aparece, porque a barra nasce dele.
 * - `auto` (linhas e áreas): o zero aparece quando as diferenças ainda cabem com ele (a variação é ao
 *   menos metade do maior valor); senão o eixo se ajusta aos dados, para uma variação pequena sobre
 *   um valor grande (ex.: caixa de 150 mil a 152 mil) não virar uma linha reta.
 */
export function chartScale(values: number[], zero: 'always' | 'auto', count = 4): ChartScale {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return { min: 0, max: 1, step: 0.25 };
  let min = Math.min(...nums);
  let max = Math.max(...nums);

  if (zero === 'always') {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  } else {
    const range = max - min;
    const farthest = Math.max(Math.abs(min), Math.abs(max));
    const spansZero = min <= 0 && max >= 0;
    if (spansZero || range >= farthest * 0.5) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    } else {
      const pad = range * 0.08 || farthest * 0.1 || 1;
      min -= pad;
      max += pad;
    }
  }
  if (min === max) max = min + 1;
  return niceScale(min, max, count);
}

/** Posições do eixo, do menor ao maior (corrige a poeira de ponto flutuante: 0.1 + 0.2). */
export function scaleTicks(scale: ChartScale): number[] {
  const count = Math.round((scale.max - scale.min) / scale.step);
  return Array.from({ length: count + 1 }, (_, i) =>
    roundTo(scale.min + scale.step * i, scale.step),
  );
}

/** Valor do degrau para o formatador: inteiro quando o degrau é inteiro, senão com casas até enxergar o degrau. */
export function roundTo(value: number, step: number): number {
  if (step >= 1) return Math.round(value);
  const decimals = Math.min(6, Math.ceil(-Math.log10(step)) + 1);
  return Number(value.toFixed(decimals));
}

/** Corta o texto com reticências para caber em `maxPx` (estimativa: ~0,56 do tamanho da fonte por letra). */
export function fitLabel(text: string, maxPx: number, fontPx = 11.5): string {
  const maxChars = Math.max(1, Math.floor(maxPx / (fontPx * 0.56)));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}
