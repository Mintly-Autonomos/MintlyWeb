import { calendarioDoHorizonte, grandesVencimentos, saldoNoFimDoBloco } from './fluxo-calendario';

// P.9 (tabela 13.3): Fluxo de caixa — calendário, grandes vencimentos e saldo no fim de cada bloco.

const p = (date: string, balance: number, inflows = 0, outflows = 0) => ({
  date,
  balance,
  inflows,
  outflows,
});

describe('calendarioDoHorizonte', () => {
  it('começa na semana de hoje (segunda a domingo) e completa a última semana', () => {
    // 2026-11-18 é quarta-feira.
    const semanas = calendarioDoHorizonte(
      [p('2026-11-18', 1_000, 200, 0), p('2026-11-19', 700, 0, 500), p('2026-11-20', 700)],
      '2026-11-18',
    );
    expect(semanas).toHaveLength(1);
    expect(semanas[0].map((c) => c?.dia ?? null)).toEqual([null, null, 18, 19, 20, null, null]);
    expect(semanas[0][2]).toMatchObject({ entradas: 200, saidas: 0, saldo: 1_000, hoje: true });
    expect(semanas[0][3]).toMatchObject({ saidas: 500, hoje: false });
  });

  it('sem projeção, sem calendário', () => {
    expect(calendarioDoHorizonte([], '2026-11-18')).toEqual([]);
  });
});

describe('grandesVencimentos', () => {
  const item = (id: string, amount: number, extra: Record<string, unknown> = {}) =>
    ({
      id,
      title: id,
      amount,
      direction: 'out',
      status: 'pending',
      dueDate: '2026-11-25',
      ...extra,
    }) as never;

  it('os maiores a pagar no período, que pesem ao menos 10% do total, até 3', () => {
    const r = grandesVencimentos({
      today: '2026-11-18',
      payable: 10_000,
      dueItems: [
        item('Aluguel', 4_200),
        item('13º', 3_000),
        item('DAS', 1_200),
        item('Internet', 150),
        item('Fornecedor', 1_100),
        item('Repasse', 5_000, { direction: 'in' }),
        item('Vencido', 9_000, { dueDate: '2026-11-10' }),
      ],
    });
    expect(r.map((i: { id: string }) => i.id)).toEqual(['Aluguel', '13º', 'DAS']);
  });
});

describe('saldoNoFimDoBloco', () => {
  it('o saldo previsto do último dia de cada bloco', () => {
    expect(
      saldoNoFimDoBloco({
        weeks: [
          { from: '2026-11-18', to: '2026-11-19', inflows: 0, outflows: 0 },
          { from: '2026-11-20', to: '2026-11-21', inflows: 0, outflows: 0 },
        ],
        projection: [
          p('2026-11-18', 100),
          p('2026-11-19', 80),
          p('2026-11-20', 300),
          p('2026-11-21', 250),
        ],
      }),
    ).toEqual([80, 250]);
  });
});
