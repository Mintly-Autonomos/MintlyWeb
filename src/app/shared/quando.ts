/**
 * Quando algo acontece, em palavras: "hoje", "amanhã" ou "em 22/11 (daqui a 4 dias)". Antes os alertas de caixa
 * diziam "dia 0" / "dia 4", que era a contagem de dias a partir de hoje e se confundia com o dia do mês.
 */
export function quandoTexto(iso: string, hojeIso: string): string {
  const dias = diasEntre(hojeIso, iso);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${iso.slice(8, 10)}/${iso.slice(5, 7)} (daqui a ${dias} dias)`;
}

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}
