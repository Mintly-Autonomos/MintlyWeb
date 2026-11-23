import { ehTaxaDeVenda } from './taxa-venda';

// Reteste 22/11, T4: uma regra só para "Taxas" no Resultado, em Custos e em Receitas.
describe('ehTaxaDeVenda', () => {
  it('comissão do app e taxa da maquininha calculadas pelas contas', () => {
    expect(ehTaxaDeVenda({ kind: 'platformFee', name: 'iFood' })).toBe(true);
    expect(ehTaxaDeVenda({ kind: 'cardFee', name: 'Stone' })).toBe(true);
  });

  it('categoria de despesa com nome de taxa, no Resultado (opex) e em Custos (category)', () => {
    expect(ehTaxaDeVenda({ kind: 'opex', name: 'Aluguel da maquininha' })).toBe(true);
    expect(
      ehTaxaDeVenda({ kind: 'category', name: 'Taxas de cartão e iFood', dreGroup: 'opex' }),
    ).toBe(true);
    expect(ehTaxaDeVenda({ kind: 'category', name: 'Aluguel', dreGroup: 'opex' })).toBe(false);
  });

  it('CMV, mão de obra e imposto ficam no grupo deles, mesmo com nome de taxa', () => {
    expect(ehTaxaDeVenda({ kind: 'labor', name: 'Comissão dos garçons' })).toBe(false);
    expect(ehTaxaDeVenda({ kind: 'category', name: 'Comissão', dreGroup: 'labor' })).toBe(false);
    expect(ehTaxaDeVenda({ kind: 'category', name: 'Taxa do DAS', dreGroup: 'tax' })).toBe(false);
  });
});
