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
