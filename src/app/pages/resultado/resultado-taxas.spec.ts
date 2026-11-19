import { ehCategoriaDeTaxa } from './resultado.component';

// Reteste 18/11, item 11: taxa lançada como despesa entra na linha de taxas da cascata.
describe('ehCategoriaDeTaxa', () => {
  it.each([
    ['Taxas de cartão e iFood', true],
    ['Taxa da maquininha', true],
    ['Tarifas bancárias', true],
    ['Comissão de vendedor', true],
    ['Aluguel da maquininha', true],
    ['Energia e gás', false],
    ['Aluguel', false],
    ['Embalagens', false],
  ])('"%s" → %s', (nome, esperado) => {
    expect(ehCategoriaDeTaxa(nome)).toBe(esperado);
  });
});
