import { comparisonBase, comparisonNote, partialMonthLabel, statDelta } from './stat-delta';

describe('statDelta', () => {
  it('sem dado não devolve variação (o card esconde a linha)', () => {
    expect(statDelta(null)).toBeNull();
    expect(statDelta(undefined)).toBeNull();
    expect(statDelta(NaN)).toBeNull();
  });

  it('subiu: ▲ com o valor sem sinal', () => {
    expect(statDelta(0.5)).toEqual({ value: '50%', up: true, note: undefined });
  });

  it('caiu: ▼ com o valor sem sinal de menos', () => {
    expect(statDelta(-0.2)).toEqual({ value: '20%', up: false, note: undefined });
  });

  it('sem alteração é neutro, não sobe nem desce', () => {
    expect(statDelta(0)).toMatchObject({ value: '0%', flat: true, up: false });
    expect(statDelta(0.0003)).toMatchObject({ flat: true });
    expect(statDelta(-0.0004)).toMatchObject({ flat: true });
  });

  it('pontos percentuais seguem a mesma regra', () => {
    expect(statDelta(2.5, { points: true })).toMatchObject({ value: '2,5 p.p.', up: true });
    expect(statDelta(-1.2, { points: true })).toMatchObject({ value: '1,2 p.p.', up: false });
    expect(statDelta(0, { points: true })).toMatchObject({ value: '0 p.p.', flat: true });
    expect(statDelta(null, { points: true })).toBeNull();
  });

  it('carrega a legenda (nota) quando informada', () => {
    expect(statDelta(0.1, { note: 'vs. ontem' })?.note).toBe('vs. ontem');
  });
});

describe('legenda das variações e selo de mês parcial (relatório S2.6)', () => {
  it('mês em andamento: compara os mesmos dias do mês anterior e diz isso', () => {
    expect(comparisonNote({ kind: 'samePeriod', untilDay: 4 }, '2026-11')).toBe(
      'vs. dias 1 a 4 de Outubro/2026',
    );
    expect(comparisonNote({ kind: 'samePeriod', untilDay: 1 }, '2026-11')).toBe(
      'vs. dia 1 de Outubro/2026',
    );
  });

  it('mês fechado: compara com o mês anterior inteiro, pelo nome', () => {
    expect(comparisonNote({ kind: 'fullMonth', untilDay: null }, '2026-10')).toBe(
      'vs. Setembro/2026',
    );
    expect(comparisonNote(undefined, '2026-01')).toBe('vs. Dezembro/2025');
  });

  it('selo só no mês parcial', () => {
    expect(partialMonthLabel({ kind: 'samePeriod', untilDay: 4 })).toBe('Mês parcial: até o dia 4');
    expect(partialMonthLabel({ kind: 'fullMonth', untilDay: null })).toBeNull();
    expect(partialMonthLabel(undefined)).toBeNull();
  });
});

describe('statDelta com a base (reteste 22/11: % absurda com base pequena ou negativa)', () => {
  const nbsp = (s: string) => s.replace(/\s/g, ' ');

  it('base negativa: diferença em reais e "virou lucro" no lucro', () => {
    // Setembro −R$ 42,10, outubro R$ 14.440,06: era "+34.399,4%".
    const d = statDelta(343.99, {
      note: 'vs. Setembro/2026',
      base: { current: 14440.06, previous: -42.1, lucro: true },
    })!;
    expect(nbsp(d.value)).toBe('R$ 14.482,16');
    expect(d.up).toBe(true);
    expect(d.note).toBe('vs. Setembro/2026 · virou lucro');
  });

  it('base pequena (variação acima de 300%): diferença em reais e "virou prejuízo"', () => {
    const d = statDelta(-51.63, {
      note: 'vs. dias 1 a 21 de Outubro/2026',
      base: { current: -21352.54, previous: 421.7, lucro: true },
    })!;
    expect(nbsp(d.value)).toBe('R$ 21.774,24');
    expect(d.up).toBe(false);
    expect(d.note).toBe('vs. dias 1 a 21 de Outubro/2026 · virou prejuízo');
  });

  it('base normal continua em %; base zero (mês sem lançamento) continua sem comparação', () => {
    expect(statDelta(0.25, { base: { current: 125, previous: 100 } })).toEqual({
      value: '25%',
      up: true,
      note: undefined,
    });
    expect(statDelta(null, { base: { current: 500, previous: 0 } })).toBeNull();
  });
});

describe('comparisonBase', () => {
  it('diz os dias no mês em andamento e o mês no mês fechado', () => {
    expect(comparisonBase({ kind: 'samePeriod', untilDay: 22 }, '2026-11')).toBe(
      'aos dias 1 a 22 de Outubro/2026',
    );
    expect(comparisonBase({ kind: 'samePeriod', untilDay: 1 }, '2026-11')).toBe(
      'ao dia 1 de Outubro/2026',
    );
    expect(comparisonBase({ kind: 'fullMonth', untilDay: null }, '2026-11')).toBe('a Outubro/2026');
  });
});
