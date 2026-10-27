/** Formatação compartilhada de moeda e datas (pt-BR). */

/** Formata um número como moeda brasileira: 1234.5 → "R$ 1.234,50". */
export function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Data + hora: "08/06/2026 14:10". Aceita ISO string. */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Apenas data: "08/06/2026". Aceita ISO string. */
export function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const MESES_LONGO = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Mês curto pra eixo de gráfico: "2026-07" → "Jul/26". Formato inválido devolve a entrada. */
export function fmtMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  const abrev = MESES_ABREV[m - 1];
  return `${abrev.charAt(0).toUpperCase()}${abrev.slice(1)}/${String(y).slice(2)}`;
}

/** Mês por extenso: "2026-07" → "Julho/2026". Formato inválido devolve a entrada. */
export function fmtMonthLong(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${MESES_LONGO[m - 1]}/${y}`;
}
