import { diasNoMes, vendaAcumulada } from './venda-acumulada';

// P.9 (tabela 13.3): venda acumulada do mês contra o ponto de equilíbrio.

const v = (date: string, gross: number) => ({ date, gross });

describe('vendaAcumulada', () => {
  it('mês fechado: soma dia a dia, acha o dia em que cruzou e ignora outros meses', () => {
    const r = vendaAcumulada(
      [v('2026-10-01', 400), v('2026-10-03', 700), v('2026-10-20', 900), v('2026-09-30', 5_000)],
      '2026-10',
      1_000,
      '2026-11-18',
    );
    expect(r.pontos).toHaveLength(31);
    expect(r.pontos.slice(0, 3).map((p) => p.acumulado)).toEqual([400, 400, 1_100]);
    expect(r.pontos[0].equilibrio).toBe(1_000);
    expect(r).toMatchObject({
      vendido: 2_000,
      cruzouNoDia: 3,
      previsaoDia: null,
      falta: 0,
      ateDia: 31,
    });
  });

  it('mês em andamento: a linha para hoje e prevê o dia de cruzar pelo ritmo', () => {
    const r = vendaAcumulada(
      [v('2026-11-02', 500), v('2026-11-05', 500)],
      '2026-11',
      4_000,
      '2026-11-10',
    );
    expect(r.pontos).toHaveLength(10);
    expect(r).toMatchObject({
      vendido: 1_000,
      ritmoDia: 100,
      cruzouNoDia: null,
      previsaoDia: null,
      falta: 3_000,
    });
    // 4.000 ÷ 100 por dia = dia 40, além do mês: não cruza.
    const r2 = vendaAcumulada([v('2026-11-02', 1_500)], '2026-11', 2_000, '2026-11-10');
    expect(r2).toMatchObject({ ritmoDia: 150, previsaoDia: 14 });
  });

  it('mês futuro não tem pontos; sem equilíbrio não cruza', () => {
    expect(vendaAcumulada([], '2026-12', 1_000, '2026-11-18').pontos).toEqual([]);
    expect(
      vendaAcumulada([v('2026-10-01', 10)], '2026-10', 0, '2026-11-18').cruzouNoDia,
    ).toBeNull();
  });

  it('dias do mês, inclusive fevereiro bissexto', () => {
    expect([diasNoMes('2026-02'), diasNoMes('2028-02'), diasNoMes('2026-11')]).toEqual([
      28, 29, 30,
    ]);
  });
});
