import { LinhaParaAviso, avisosImportacao } from './import-parse';

const linha = (row: number, over: Partial<LinhaParaAviso> = {}): LinhaParaAviso => ({
  row,
  type: 'expense',
  title: `Compra ${row}`,
  value: 100,
  date: '2026-11-10',
  accountName: 'Nubank',
  ...over,
});

describe('avisosImportacao (erros do dono na planilha, relatório S3.10)', () => {
  it('planilha normal: nenhum aviso', () => {
    const linhas = [2, 3, 4, 5, 6].map((r) => linha(r, { value: 80 + r }));
    expect(avisosImportacao(linhas).size).toBe(0);
  });

  it('linha repetida (mesmo tipo, título, valor, data e conta) avisa na segunda, citando a primeira', () => {
    const linhas = [
      linha(2, { title: 'Pix fornecedor', value: 350 }),
      linha(3),
      linha(4, { title: 'PIX  Fornecedor', value: 350 }),
    ];
    const avisos = avisosImportacao(linhas);
    expect([...avisos.keys()]).toEqual([2]);
    expect(avisos.get(2)).toContain('Igual à linha 1 desta planilha');
  });

  it('mesmo título e valor em outro dia ou outra conta não é repetição', () => {
    const linhas = [
      linha(2, { title: 'Aluguel', value: 2000 }),
      linha(3, { title: 'Aluguel', value: 2000, date: '2026-12-10' }),
      linha(4, { title: 'Aluguel', value: 2000, accountName: 'Caixa' }),
    ];
    expect(avisosImportacao(linhas).size).toBe(0);
  });

  it('valor 20× acima da mediana do mesmo tipo (e ≥ R$ 1.000) parece em centavos', () => {
    const linhas = [
      linha(2, { value: 90 }),
      linha(3, { value: 110 }),
      linha(4, { value: 100 }),
      linha(5, { value: 95 }),
      linha(6, { value: 150_000 }),
    ];
    const avisos = avisosImportacao(linhas);
    expect([...avisos.keys()]).toEqual([4]);
    expect(avisos.get(4)).toMatch(/perto de R\$\s?100,00/);
    expect(avisos.get(4)).toMatch(/o certo seria R\$\s?1\.500,00/);
  });

  it('receitas e despesas têm medianas separadas', () => {
    const despesas = [2, 3, 4, 5, 6].map((r) => linha(r, { value: 50 }));
    const receita = linha(7, { type: 'income', value: 5_000 });
    expect(avisosImportacao([...despesas, receita]).size).toBe(0);
  });

  it('poucas linhas do tipo: sem mediana confiável, sem aviso de valor', () => {
    const linhas = [linha(2, { value: 10 }), linha(3, { value: 20_000 })];
    expect(avisosImportacao(linhas).size).toBe(0);
  });

  it('abaixo de R$ 1.000 não avisa, mesmo 20× a mediana', () => {
    const linhas = [2, 3, 4, 5].map((r) => linha(r, { value: 10 }));
    expect(avisosImportacao([...linhas, linha(6, { value: 500 })]).size).toBe(0);
  });

  it('linha sem tipo, valor ou data fica de fora dos avisos (já tem erro próprio)', () => {
    const linhas = [linha(2, { type: null }), linha(3, { type: null }), linha(4, { value: 0 })];
    expect(avisosImportacao(linhas).size).toBe(0);
  });
});
