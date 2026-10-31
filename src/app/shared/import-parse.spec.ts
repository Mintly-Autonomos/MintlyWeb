import {
  decodeCsv,
  mapColumns,
  matchName,
  normalizeKey,
  parseCsv,
  parsePayment,
  parseStatus,
  parseType,
  templateColumns,
} from './import-parse';

const METHODS = [
  'Dinheiro',
  'PIX',
  'Débito',
  'Crédito',
  'Transferência',
  'Boleto',
  'Carteira Digital',
] as const;

describe('normalizeKey', () => {
  it('sem caixa, sem acento, sem pontuação', () => {
    expect(normalizeKey('  Cartão de Crédito! ')).toBe('cartao de credito');
    expect(normalizeKey('Data (AAAA-MM-DD)')).toBe('data aaaa mm dd');
  });
});

describe('mapColumns', () => {
  it('cabeçalho do modelo do Mintly', () => {
    expect(
      mapColumns([
        'Tipo',
        'Título',
        'Valor',
        'Data (AAAA-MM-DD)',
        'Categoria',
        'Conta',
        'Forma de pagamento',
        'Status',
        'Observações',
      ]),
    ).toEqual(templateColumns());
  });

  it('sinônimos e ordem diferente', () => {
    expect(mapColumns(['Data', 'Histórico', 'Total', 'Situação', 'Meio de pagamento'])).toEqual({
      date: 0,
      title: 1,
      value: 2,
      status: 3,
      payment: 4,
    });
  });

  it('uma coluna não é usada para dois campos', () => {
    const cols = mapColumns(['Valor', 'Valor total']);
    expect(new Set(Object.values(cols)).size).toBe(Object.values(cols).length);
  });

  it('cabeçalhos que não são nossos não casam com nada', () => {
    expect(mapColumns(['Foo', 'Bar'])).toEqual({});
  });
});

describe('parseCsv', () => {
  it('detecta ; , e tab', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('aspas: delimitador, aspas duplicadas e quebra de linha dentro da célula', () => {
    expect(parseCsv('a;b\n"x;y";"ele disse ""oi"""\n"linha1\nlinha2";z')).toEqual([
      ['a', 'b'],
      ['x;y', 'ele disse "oi"'],
      ['linha1\nlinha2', 'z'],
    ]);
  });

  it('CRLF, linhas vazias e última linha sem quebra', () => {
    expect(parseCsv('a;b\r\n\r\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('decodeCsv', () => {
  it('UTF-8 com BOM', () => {
    const bytes = new TextEncoder().encode('﻿Título');
    expect(decodeCsv(bytes.buffer as ArrayBuffer)).toBe('Título');
  });

  it('Windows-1252 quando não é UTF-8 válido', () => {
    expect(decodeCsv(new Uint8Array([0x43, 0x61, 0x66, 0xe9]).buffer as ArrayBuffer)).toBe('Café');
  });
});

describe('parseType', () => {
  it('receita/despesa e sinônimos', () => {
    expect(parseType('Receita')).toBe('income');
    expect(parseType('entrada')).toBe('income');
    expect(parseType('Despesa')).toBe('expense');
    expect(parseType('Saída')).toBe('expense');
    expect(parseType('investimento')).toBeNull();
    expect(parseType('')).toBeNull();
  });
});

describe('parsePayment', () => {
  it.each([
    ['Pix', 'PIX'],
    ['pix', 'PIX'],
    ['Cartão de crédito', 'Crédito'],
    ['cartao de debito', 'Débito'],
    ['Carteira digital', 'Carteira Digital'],
    ['espécie', 'Dinheiro'],
    ['TED', 'Transferência'],
    ['Boleto', 'Boleto'],
  ])('"%s" -> %s', (text, expected) => {
    expect(parsePayment(text, METHODS)).toBe(expected);
  });

  it('o que não reconhece vira null', () => {
    expect(parsePayment('Fiado', METHODS)).toBeNull();
    expect(parsePayment('', METHODS)).toBeNull();
  });
});

describe('parseStatus', () => {
  it('status diretos', () => {
    expect(parseStatus('Recebido', null)).toBe('received');
    expect(parseStatus('PAGO', null)).toBe('paid');
    expect(parseStatus('Pendente', null)).toBe('pending');
    expect(parseStatus('Cancelado', null)).toBe('cancelled');
  });

  it('"concluído" depende do tipo', () => {
    expect(parseStatus('Concluído', 'income')).toBe('received');
    expect(parseStatus('Concluído', 'expense')).toBe('paid');
    expect(parseStatus('Concluído', null)).toBeNull();
  });

  it('vazio ou desconhecido vira null', () => {
    expect(parseStatus('', 'income')).toBeNull();
    expect(parseStatus('talvez', 'income')).toBeNull();
  });
});

describe('matchName', () => {
  const list = [{ name: 'Venda Delivery' }, { name: 'Gás' }];
  it('casa sem diferenciar caixa nem acento', () => {
    expect(matchName('venda delivery', list)).toBe(list[0]);
    expect(matchName('GAS', list)).toBe(list[1]);
    expect(matchName('Outra', list)).toBeNull();
    expect(matchName('', list)).toBeNull();
  });
});
