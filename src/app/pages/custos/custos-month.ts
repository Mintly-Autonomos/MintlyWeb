export type MonthOpt = 'esteMes' | 'mesPassado' | 'personalizado';

/** Até este dia do mês a tela abre no mês passado: o mês corrente mal começou e o que interessa é o mês já fechado. */
export const CLOSED_MONTH_UNTIL_DAY = 12;

/** "AAAA-MM" do mês `offset` meses a partir de `now` (0 = este, -1 = passado). */
export function monthStr(offset = 0, now = new Date()): string {
  // Dia 1 antes de mudar o mês: 31/03 menos um mês cairia em 31/02 e viraria 03/03.
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Dia 1 ao 12: abre no mês passado (já fechado); do 13 em diante, no mês atual. */
export function defaultMonthOpt(now = new Date()): MonthOpt {
  return now.getDate() <= CLOSED_MONTH_UNTIL_DAY ? 'mesPassado' : 'esteMes';
}
