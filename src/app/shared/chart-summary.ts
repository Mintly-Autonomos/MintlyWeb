/**
 * Texto alternativo dos gráficos (leitor de tela): o que o gráfico mostra, em frase. Cada série lista
 * os pontos ("Lucro: jun R$ 1.200, jul R$ 900"); com muitos pontos, só os últimos `maxPoints`, avisando.
 */
const field = (d: unknown, key: string): unknown =>
  d && typeof d === 'object' ? (d as Record<string, unknown>)[key] : undefined;

export function seriesSummary(
  kind: string,
  data: readonly unknown[],
  categoryKey: string,
  series: readonly { key: string; name: string }[],
  fmt: (v: number) => string,
  maxPoints = 12,
): string {
  if (!data.length || !series.length) return `${kind} sem dados`;
  const shown = data.slice(-maxPoints);
  const corte = data.length > shown.length ? ` (últimos ${shown.length} de ${data.length})` : '';
  const partes = series.map((s) => {
    const pontos = shown
      .map((d) => {
        const v = field(d, s.key);
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        return `${String(field(d, categoryKey) ?? '')} ${fmt(v)}`.trim();
      })
      .filter((p): p is string => p !== null);
    return `${s.name}: ${pontos.join(', ') || 'sem valores'}`;
  });
  return `${kind}${corte}. ${partes.join('; ')}`;
}

export function itemsSummary(
  kind: string,
  items: readonly { label: string; value: number }[],
  fmt: (v: number) => string,
): string {
  if (!items.length) return `${kind} sem dados`;
  return `${kind}. ${items.map((i) => `${i.label}: ${fmt(i.value)}`).join('; ')}`;
}
