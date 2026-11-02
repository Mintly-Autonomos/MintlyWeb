import {
  DISH_IGNORE,
  matchDishLines,
  normalizeDishName,
  recognizedItems,
  similarity,
  splitDishText,
} from './dish-match';

const cardapio = [
  { id: 'arroz', name: 'Arroz' },
  { id: 'arroz-batata', name: 'Arroz com Batata' },
  { id: 'batata', name: 'Batata Rústica' },
  { id: 'curry', name: 'Curry' },
  { id: 'soyu', name: 'Soyu e alho' },
];

describe('normalizeDishName', () => {
  it.each([
    ['Arroz com Batata', 'arrozcombatata'],
    ['arróz  com   batata', 'arrozcombatata'],
    ['ARROZ-COM-BATATA!', 'arrozcombatata'],
    ['Batata Rústica', 'batatarustica'],
    ['Açaí 500ml', 'acai500ml'],
  ])('"%s" -> "%s"', (raw, expected) => {
    expect(normalizeDishName(raw)).toBe(expected);
  });

  it('"arroz com batata" é diferente de "arroz" e de "arroz sem batata"', () => {
    expect(normalizeDishName('arroz com batata')).not.toBe(normalizeDishName('arroz'));
    expect(normalizeDishName('arroz com batata')).not.toBe(normalizeDishName('arroz sem batata'));
  });
});

describe('splitDishText', () => {
  it('separa por +, ; e , (o exemplo da Keeta)', () => {
    const parts = splitDishText('Curry + Batata Rústica; Soyu e alho + Batata Rústica');
    expect(parts.map((p) => [p.text, p.qty])).toEqual([
      ['Curry', 1],
      ['Batata Rústica', 2], // repetido soma
      ['Soyu e alho', 1],
    ]);
  });

  it('o " e " não separa: "Soyu e alho" é um nome', () => {
    expect(splitDishText('Soyu e alho').map((p) => p.text)).toEqual(['Soyu e alho']);
  });

  it.each([
    ['2x Arroz', 'Arroz', 2],
    ['2 x Arroz', 'Arroz', 2],
    ['Arroz x3', 'Arroz', 3],
    ['Arroz 4x', 'Arroz', 4],
    ['Arroz', 'Arroz', 1],
  ])('quantidade em "%s"', (raw, name, qty) => {
    expect(splitDishText(raw).map((p) => [p.text, p.qty])).toEqual([[name, qty]]);
  });

  it('vírgula e quebra de linha também separam; pedaços vazios somem', () => {
    expect(splitDishText('Arroz,, Curry\n\nBatata Rústica ; ').map((p) => p.text)).toEqual([
      'Arroz',
      'Curry',
      'Batata Rústica',
    ]);
  });

  it('a quantidade fica entre 1 e 99', () => {
    expect(splitDishText('500x Arroz')[0].qty).toBe(99);
    expect(splitDishText('0x Arroz')[0].qty).toBe(1);
  });

  it('vazio ou só pontuação não gera nada', () => {
    expect(splitDishText(null)).toEqual([]);
    expect(splitDishText('')).toEqual([]);
    expect(splitDishText(' + ; , ')).toEqual([]);
  });
});

describe('matchDishLines (igualdade exata, nada é adivinhado)', () => {
  const match = (text: string, aliases = {}) =>
    matchDishLines(splitDishText(text), cardapio, aliases);

  it('reconhece nome igual mesmo com acento, caixa e espaços diferentes', () => {
    expect(match('arróz COM batata')[0].menuItemId).toBe('arroz-batata');
    expect(match('batata rustica')[0].menuItemId).toBe('batata');
  });

  it('"arroz com batata" casa com o prato inteiro, não com "arroz"', () => {
    const [l] = match('Arroz com Batata');
    expect(l.menuItemId).toBe('arroz-batata');
  });

  it('"arroz sem batata" NÃO casa com "arroz" nem com "arroz com batata": não reconhecido', () => {
    const [l] = match('Arroz sem batata');
    expect(l.menuItemId).toBeNull();
  });

  it('o que não bate vira não reconhecido e sugere o prato mais parecido (sem aplicar)', () => {
    const [l] = match('Batata Rustica grande');
    expect(l.menuItemId).toBeNull();
    expect(l.ignored).toBe(false);
    expect(l.suggestion).toEqual({ id: 'batata', name: 'Batata Rústica' });
  });

  it('sem nada parecido, não sugere', () => {
    expect(match('Sorvete de pistache')[0].suggestion).toBeNull();
  });

  it('a escolha guardada vale: texto -> prato', () => {
    const key = normalizeDishName('Batata grande');
    const [l] = match('Batata grande', { [key]: 'batata' });
    expect(l.menuItemId).toBe('batata');
  });

  it('"ignorar" guardado tira o texto da lista de não reconhecidos', () => {
    const key = normalizeDishName('Sem cebola');
    const [l] = match('Sem cebola', { [key]: DISH_IGNORE });
    expect(l.ignored).toBe(true);
    expect(l.menuItemId).toBeNull();
  });

  it('vínculo guardado para um prato que não existe mais é ignorado (volta a não reconhecido)', () => {
    const key = normalizeDishName('Batata grande');
    expect(match('Batata grande', { [key]: 'apagado' })[0].menuItemId).toBeNull();
  });

  it('nome igual do cardápio vale mais que o vínculo guardado', () => {
    const key = normalizeDishName('Curry');
    expect(match('Curry', { [key]: 'batata' })[0].menuItemId).toBe('curry');
  });
});

describe('recognizedItems', () => {
  it('só os reconhecidos, somando o mesmo prato vindo de textos diferentes', () => {
    const key = normalizeDishName('Batata grande');
    const lines = matchDishLines(
      splitDishText('2x Batata Rústica + Batata grande + Sorvete'),
      cardapio,
      { [key]: 'batata' },
    );
    expect(recognizedItems(lines)).toEqual([{ menuItemId: 'batata', qty: 3 }]);
  });

  it('nada reconhecido: lista vazia', () => {
    expect(recognizedItems(matchDishLines(splitDishText('Sorvete'), cardapio))).toEqual([]);
  });
});

describe('similarity', () => {
  it('iguais = 1; sem letras em comum = 0', () => {
    expect(similarity('arroz', 'arroz')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('parecidos ficam acima de 0,6', () => {
    expect(similarity('batatarustica', 'batatarusticagrande')).toBeGreaterThan(0.6);
  });
});
