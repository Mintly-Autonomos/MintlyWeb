import { statDelta } from './stat-delta';

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
