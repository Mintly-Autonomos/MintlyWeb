import type { CashFlowReport, DailyPoint, DueItem } from 'mintly-lib';

/**
 * Gráficos do Fluxo de caixa revistos (relatório Sweetie Bel, P.9 / tabela 13.3). Funções puras (testadas sem tela).
 */

export interface DiaCalendario {
  date: string;
  dia: number;
  entradas: number;
  saidas: number;
  saldo: number;
  hoje: boolean;
}

/** Semanas (segunda a domingo) do horizonte, de hoje até o último dia da projeção. `null` = dia fora dele. */
export function calendarioDoHorizonte(
  projection: DailyPoint[],
  today: string,
): (DiaCalendario | null)[][] {
  if (projection.length === 0) return [];
  const dias: (DiaCalendario | null)[] = [];
  const [y, m, d] = projection[0].date.split('-').map(Number);
  const semana = (new Date(y, m - 1, d).getDay() + 6) % 7; // segunda = 0
  for (let i = 0; i < semana; i++) dias.push(null);
  for (const p of projection) {
    dias.push({
      date: p.date,
      dia: Number(p.date.slice(8, 10)),
      entradas: p.inflows,
      saidas: p.outflows,
      saldo: p.balance,
      hoje: p.date === today,
    });
  }
  while (dias.length % 7 !== 0) dias.push(null);
  const semanas: (DiaCalendario | null)[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas;
}

/**
 * Os maiores vencimentos a pagar no horizonte (aluguel, 13º, DAS…), para marcar no gráfico. Só os que pesam: ao
 * menos 10% do total a pagar no período.
 */
export function grandesVencimentos(
  report: Pick<CashFlowReport, 'dueItems' | 'payable' | 'today'>,
  n = 3,
): DueItem[] {
  const piso = report.payable * 0.1;
  return report.dueItems
    .filter(
      (i) =>
        i.direction === 'out' &&
        i.status === 'pending' &&
        i.dueDate >= report.today &&
        i.amount >= piso &&
        i.amount > 0,
    )
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

/** Saldo previsto no último dia de cada bloco (semana) do gráfico Entradas × Saídas. */
export function saldoNoFimDoBloco(report: Pick<CashFlowReport, 'weeks' | 'projection'>): number[] {
  return report.weeks.map((w) => {
    const ultimo = [...report.projection].reverse().find((p) => p.date <= w.to);
    return ultimo?.balance ?? 0;
  });
}
