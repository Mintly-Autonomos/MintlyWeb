import { chartScale, fitLabel, niceScale, roundTo, scaleTicks } from './chart-scale';

describe('niceScale', () => {
  it.each([
    [0, 100, { min: 0, max: 100, step: 25 }],
    [0, 87, { min: 0, max: 100, step: 25 }],
    [0, 3, { min: 0, max: 3, step: 1 }],
    [0, 0.8, { min: 0, max: 0.8, step: 0.2 }],
    [-50, 120, { min: -50, max: 150, step: 50 }],
    [0, 1_250_000, { min: 0, max: 1_500_000, step: 500_000 }],
  ])('%s a %s', (min, max, expected) => {
    expect(niceScale(min, max)).toEqual(expected);
  });

  it('limites exatos não ganham um degrau a mais por erro de ponto flutuante', () => {
    expect(niceScale(0, 300, 3)).toEqual({ min: 0, max: 300, step: 100 });
  });

  it('valor único ganha folga dos dois lados', () => {
    const s = niceScale(50, 50);
    expect(s.min).toBeLessThan(50);
    expect(s.max).toBeGreaterThan(50);
  });

  it('entrada inválida não quebra', () => {
    expect(niceScale(NaN, 10)).toEqual({ min: 0, max: 1, step: 0.25 });
    expect(niceScale(10, 1)).toEqual({ min: 0, max: 1, step: 0.25 });
  });
});

describe('chartScale — barras (zero sempre)', () => {
  it('só positivos: começa no zero', () => {
    expect(chartScale([10, 90], 'always')).toMatchObject({ min: 0, max: 100 });
  });

  it('com negativos: o zero fica dentro do eixo e os negativos cabem', () => {
    const s = chartScale([-30, 80], 'always');
    expect(s.min).toBeLessThanOrEqual(-30);
    expect(s.max).toBeGreaterThanOrEqual(80);
    expect(scaleTicks(s)).toContain(0);
  });

  it('tudo zero ou vazio: eixo válido', () => {
    expect(chartScale([0, 0], 'always').max).toBeGreaterThan(0);
    expect(chartScale([], 'always').max).toBeGreaterThan(0);
  });

  it('valores pequenos (0,3 a 0,9) ainda têm degraus legíveis', () => {
    const ticks = scaleTicks(chartScale([0.3, 0.9], 'always'));
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(0.9);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
});

describe('chartScale — linhas e áreas (mostra as diferenças)', () => {
  it('margem de 28% a 31%: o eixo se ajusta e não vira uma faixa 0–100', () => {
    const s = chartScale([28, 29.5, 31], 'auto');
    expect(s.min).toBeGreaterThan(0);
    expect(s.max).toBeLessThan(50);
  });

  it('caixa de 150 mil a 152 mil: a variação aparece', () => {
    const s = chartScale([150_000, 151_000, 152_000], 'auto');
    expect(s.min).toBeGreaterThan(100_000);
    expect(s.max - s.min).toBeLessThan(20_000);
  });

  it('variação grande sobre o valor: o zero entra', () => {
    expect(chartScale([10, 100], 'auto').min).toBe(0);
  });

  it('valores negativos e positivos: o eixo abrange os dois lados', () => {
    const s = chartScale([-20, 40], 'auto');
    expect(s.min).toBeLessThanOrEqual(-20);
    expect(s.max).toBeGreaterThanOrEqual(40);
  });

  it('tudo negativo (prejuízo) cabe no eixo', () => {
    const s = chartScale([-80, -60], 'auto');
    expect(s.min).toBeLessThanOrEqual(-80);
    expect(s.max).toBeGreaterThanOrEqual(-60);
  });

  it('série constante não gera eixo vazio', () => {
    const s = chartScale([42, 42, 42], 'auto');
    expect(s.max).toBeGreaterThan(s.min);
  });
});

describe('scaleTicks e roundTo', () => {
  it('posições do eixo, sem poeira de ponto flutuante', () => {
    expect(scaleTicks({ min: 0, max: 0.6, step: 0.2 })).toEqual([0, 0.2, 0.4, 0.6]);
    expect(scaleTicks({ min: -50, max: 100, step: 50 })).toEqual([-50, 0, 50, 100]);
  });

  it('degrau inteiro arredonda para inteiro; fracionário mantém as casas', () => {
    expect(roundTo(99.6, 25)).toBe(100);
    expect(roundTo(0.30000000000000004, 0.1)).toBe(0.3);
  });
});

describe('fitLabel', () => {
  it('texto que cabe não muda', () => {
    expect(fitLabel('Batata', 170)).toBe('Batata');
  });

  it('pedido inteiro é cortado com reticências e cabe na largura', () => {
    const pedido = 'Curry + Batata Rústica; Soyu e alho + Batata Rústica; Refrigerante 350ml';
    const out = fitLabel(pedido, 162);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThan(pedido.length);
    expect(out.length * 11.5 * 0.56).toBeLessThanOrEqual(162 + 11.5);
  });

  it('largura minúscula ainda devolve algo', () => {
    expect(fitLabel('Batata', 1).length).toBeGreaterThan(0);
  });
});
