import { ligarProjecao } from './visao-geral.component';

// Problemas 23/11 (item 20): a linha tracejada da projeção precisa de dois pontos.
describe('ligarProjecao', () => {
  const row = (receita: number | null, receitaProj: number | null = null) => ({
    receita,
    despesa: receita,
    receitaProj,
    despesaProj: receitaProj,
  });

  it('projeção do mês atual (com dado parcial) sai do mês anterior', () => {
    const rows = ligarProjecao([row(80), row(90), row(40, 94.7)]);
    expect(rows[1].receitaProj).toBe(90);
    expect(rows[2].receitaProj).toBe(94.7);
    expect(rows[0].receitaProj).toBeNull();
  });

  it('projeção num mês sem dado real liga ao último ponto real', () => {
    const rows = ligarProjecao([row(80), row(90), row(null, 100)]);
    expect(rows[1].receitaProj).toBe(90);
  });

  it('sem projeção nada muda', () => {
    expect(ligarProjecao([row(1), row(2)]).every((r) => r.receitaProj === null)).toBe(true);
  });
});
