import { PRICE_REVIEW_ALERT_DAYS } from 'mintly-lib';
import {
  Prato,
  diasSemRevisao,
  mesesParado,
  precisaRevisar,
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
      active: false,
      priceUpdatedAt: '2026-05-01T00:00:00.000Z',
      priceReviewedAt: '2026-06-01T00:00:00.000Z',
    });
  });
});
