import { acumulado } from './fluxo-caixa.component';

describe('acumulado (minigráficos de A receber / A pagar)', () => {
  it('soma dia a dia e termina no total do card, com as vencidas no primeiro dia', () => {
    const pontos = [
      { inflows: 0, outflows: 50000 },
      { inflows: 100, outflows: 0 },
      { inflows: 0, outflows: 7868.19 },
    ];
    expect(acumulado(pontos, 'outflows')).toEqual([50000, 50000, 57868.19]);
    expect(acumulado(pontos, 'inflows')).toEqual([0, 100, 100]);
  });
});
