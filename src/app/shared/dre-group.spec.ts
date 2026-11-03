import { DRE_GROUP_OPTIONS, dreGroupOptionsFor, dreGroupShort, sugereCmv } from './dre-group';

describe('sugereCmv', () => {
  it.each([
    'Fornecedor',
    'Fornecedores de carne',
    'Insumos',
    'Hortifrúti',
    'Carnes e frango',
    'Bebidas',
    'Embalagem descartável',
    'Mercadoria para revenda',
    'Peixe',
  ])('"%s" parece ingrediente ou insumo', (nome) => {
    expect(sugereCmv(nome)).toBe(true);
  });

  it.each(['Aluguel', 'Marketing', 'Contador', 'Energia elétrica', 'Salários', 'Taxa Keeta', ''])(
    '"%s" não parece ingrediente',
    (nome) => {
      expect(sugereCmv(nome)).toBe(false);
    },
  );

  it('não confunde palavra que só contém o começo no meio (ex.: "descarne")', () => {
    expect(sugereCmv('Descarnes')).toBe(false);
  });
});

describe('opções do grupo no resultado', () => {
  it('oferece CMV, mão de obra e despesa operacional; imposto fica de fora', () => {
    expect(DRE_GROUP_OPTIONS.map((o) => o.value)).toEqual(['cmv', 'labor', 'opex']);
    expect(dreGroupOptionsFor('opex').map((o) => o.value)).toEqual(['cmv', 'labor', 'opex']);
    expect(dreGroupOptionsFor(undefined).map((o) => o.value)).not.toContain('tax');
  });

  it('só mostra "Imposto" quando a categoria já está nesse grupo', () => {
    expect(dreGroupOptionsFor('tax').map((o) => o.value)).toContain('tax');
  });

  it('rótulo curto da lista; sem grupo vale despesa operacional', () => {
    expect(dreGroupShort('cmv')).toBe('CMV');
    expect(dreGroupShort('labor')).toBe('Mão de obra');
    expect(dreGroupShort('tax')).toBe('Imposto');
    expect(dreGroupShort('opex')).toBe('Despesa operacional');
    expect(dreGroupShort(undefined)).toBe('Despesa operacional');
  });
});
