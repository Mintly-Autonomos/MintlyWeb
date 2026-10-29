import { PRICE_REVIEW_ALERT_DAYS } from 'mintly-lib';
import {
  Prato,
  analisar,
  analisavel,
  diasSemRevisao,
  faixaPreco,
  impactoMes,
  incompleto,
  mesesParado,
  precisaRevisar,
  recalcular,
  tempoLabel,
  toPrato,
} from './cardapio.builder';

const NOW = new Date('2026-10-28T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const prato = (over: Partial<Prato> = {}): Prato => ({
  id: 'p1',
  name: 'Frango Original',
  category: 'Frango',
  price: 36,
  cost: 14,
  soldPerMonth: 100,
  active: true,
  priceUpdatedAt: daysAgo(10),
  priceReviewedAt: daysAgo(10),
  ...over,
});

describe('precisaRevisar', () => {
  it('avisa só a partir de PRICE_REVIEW_ALERT_DAYS (167 dias) e só para prato ativo', () => {
    expect(PRICE_REVIEW_ALERT_DAYS).toBe(167);
    expect(precisaRevisar(prato({ priceReviewedAt: daysAgo(166) }), NOW)).toBe(false);
    expect(precisaRevisar(prato({ priceReviewedAt: daysAgo(167) }), NOW)).toBe(true);
    expect(precisaRevisar(prato({ priceReviewedAt: daysAgo(400), active: false }), NOW)).toBe(
      false,
    );
  });

  it('a revisão manda, não a última mudança de valor', () => {
    const p = prato({ priceUpdatedAt: daysAgo(400), priceReviewedAt: daysAgo(5) });
    expect(diasSemRevisao(p, NOW)).toBe(5);
    expect(precisaRevisar(p, NOW)).toBe(false);
  });
});

describe('textos de tempo', () => {
  it('tempoLabel', () => {
    expect(tempoLabel(0)).toBe('hoje');
    expect(tempoLabel(1)).toBe('há 1 dia');
    expect(tempoLabel(12)).toBe('há 12 dias');
    expect(tempoLabel(31)).toBe('há 1 mês');
    expect(tempoLabel(180)).toBe('há 5 meses');
  });

  it('mesesParado nunca fica abaixo de 1', () => {
    expect(mesesParado(167)).toBe(5);
    expect(mesesParado(200)).toBe(6);
    expect(mesesParado(3)).toBe(1);
  });
});

describe('toPrato', () => {
  it('mapeia a entidade da lib (id, status e datas)', () => {
    const p = toPrato({
      _id: 'm1',
      name: 'Soju',
      price: 25,
      status: 'inactive',
      priceUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
      priceReviewedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(p).toEqual({
      id: 'm1',
      name: 'Soju',
      category: null,
      price: 25,
      cost: 0,
      soldPerMonth: 0,
      active: false,
      priceUpdatedAt: '2026-05-01T00:00:00.000Z',
      priceReviewedAt: '2026-06-01T00:00:00.000Z',
    });
  });
});

// Cardápio do protótipo (Lovable, mock-previsoes.ts): [nome, categoria, vendidos, preço, custo].
const PROTOTIPO: [string, string, number, number, number][] = [
  ['Frango Yangnyeom', 'Frango', 420, 64, 26],
  ['Frango Soy Garlic', 'Frango', 356, 62, 25],
  ['Frango Honey Butter', 'Frango', 188, 66, 31],
  ['Frango ao Alho Crocante', 'Frango', 132, 60, 30],
  ['Frango Cheese Powder', 'Frango', 74, 68, 38],
  ['Batata Coreana', 'Acompanhamento', 310, 22, 8],
  ['Tteokbokki', 'Acompanhamento', 164, 34, 15],
  ['Kimchi da casa', 'Acompanhamento', 96, 18, 9],
  ['Japchae', 'Acompanhamento', 58, 38, 22],
  ['Cerveja long neck', 'Bebida', 148, 14, 4],
  ['Soju', 'Bebida', 92, 28, 9],
  ['Refrigerante lata', 'Bebida', 268, 8, 3],
  ['Chá gelado de cevada', 'Bebida', 46, 12, 4],
  ['Bingsu de morango', 'Sobremesa', 38, 32, 19],
];
const cardapio = PROTOTIPO.map(([name, category, soldPerMonth, price, cost]) =>
  prato({ id: name, name, category, soldPerMonth, price, cost }),
);
const nomes = (xs: { nome: string }[]) => xs.map((x) => x.nome).sort();

describe('analisar (menu engineering, igual ao protótipo)', () => {
  it('classifica o cardápio do protótipo nos mesmos quatro grupos', () => {
    const a = analisar(cardapio);
    expect(a.mediaQtd).toBeCloseTo(170.71, 2);
    expect(a.mediaMargemPct).toBeCloseTo(56.21, 2);
    expect(nomes(a.grupos.estrela)).toEqual(
      ['Batata Coreana', 'Frango Soy Garlic', 'Frango Yangnyeom', 'Refrigerante lata'].sort(),
    );
    expect(nomes(a.grupos.cavalo)).toEqual(['Frango Honey Butter']);
    expect(nomes(a.grupos.quebraCabeca)).toEqual(
      ['Cerveja long neck', 'Chá gelado de cevada', 'Soju'].sort(),
    );
    expect(a.grupos.repensar).toHaveLength(6);
  });

  it('ordena cada grupo por vendidos × margem, do maior para o menor', () => {
    const a = analisar(cardapio);
    expect(a.grupos.estrela[0].nome).toBe('Frango Yangnyeom');
    const valores = a.grupos.estrela.map((i) => i.qtd * i.margem);
    expect(valores).toEqual([...valores].sort((x, y) => y - x));
  });

  it('simular o preço recalcula margem e médias, e o prato pode mudar de grupo', () => {
    const base = analisar(cardapio);
    expect(base.grupos.estrela.map((i) => i.nome)).toContain('Refrigerante lata');
    // Refrigerante de R$ 8 para R$ 12: margem de 62,5% para 75%
    const sim = analisar(cardapio, { 'Refrigerante lata': 12 });
    const refri = sim.itens.find((i) => i.nome === 'Refrigerante lata')!;
    expect(refri.margemPct).toBeCloseTo(75, 1);
    expect(refri.alterado).toBe(true);
    expect(sim.mediaMargemPct).toBeCloseTo(57.1, 1); // a média sobe com o preço simulado
    // um preço bem baixo derruba a margem % e tira o Refrigerante dos Melhores
    const baixo = analisar(cardapio, { 'Refrigerante lata': 3.5 });
    expect(baixo.grupos.estrela.map((i) => i.nome)).not.toContain('Refrigerante lata');
  });

  it('impacto no mês = diferença de margem × vendidos', () => {
    const original = recalcular(cardapio[11], 8);
    const simulado = recalcular(cardapio[11], 12);
    expect(impactoMes(simulado, original)).toBe((12 - 8) * 268);
    expect(impactoMes(original, original)).toBe(0);
  });

  it('faixa do controle de preço: de max(custo+1, preço−10) até preço+10, passo 0,50', () => {
    expect(faixaPreco({ price: 64, cost: 26 })).toEqual({ min: 54, max: 74, passo: 0.5 });
    expect(faixaPreco({ price: 8, cost: 3 })).toEqual({ min: 4, max: 18, passo: 0.5 });
  });

  it('só entram pratos ativos com custo e vendidos informados; os demais são "incompletos"', () => {
    const lista = [
      prato({ id: 'a', cost: 10, soldPerMonth: 50 }),
      prato({ id: 'b', cost: 0, soldPerMonth: 50 }),
      prato({ id: 'c', cost: 10, soldPerMonth: 0 }),
      prato({ id: 'd', cost: 10, soldPerMonth: 50, active: false }),
    ];
    expect(analisar(lista).itens.map((i) => i.id)).toEqual(['a']);
    expect(lista.filter(analisavel).map((p) => p.id)).toEqual(['a']);
    expect(lista.filter(incompleto).map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('cardápio vazio não quebra', () => {
    const a = analisar([]);
    expect(a.itens).toEqual([]);
    expect(a.grupos.estrela).toEqual([]);
  });
});
