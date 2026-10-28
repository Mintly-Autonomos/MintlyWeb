/** Formatação compartilhada de moeda e datas (pt-BR). */

/** Formata um número como moeda brasileira: 1234.5 → "R$ 1.234,50". */
export function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Máscara de telefone BR (10 ou 11 dígitos): "11999999999" → "(11) 99999-9999". */
export function maskPhoneBR(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  const cut = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, cut)}-${d.slice(cut)}`;
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

/**
 * Data de calendário ("2026-10-28" ou "2026-10-28T00:00:00.000Z") não tem fuso: montar com
 * `new Date(iso)` a interpreta como meia-noite UTC e, no Brasil (UTC-3), mostra o dia anterior.
 */
function parseCalendarDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
}

/** Apenas data: "08/06/2026". Aceita ISO string. */
export function fmtShortDate(iso: string): string {
  return parseCalendarDate(iso).toLocaleDateString('pt-BR', {
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
