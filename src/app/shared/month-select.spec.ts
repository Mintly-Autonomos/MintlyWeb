import { defaultMonthOpt, monthStr } from './month-select';

describe('defaultMonthOpt (qual período a tela de Custos abre)', () => {
  it.each([1, 2, 12])('dia %i abre no mês passado', (day) => {
    expect(defaultMonthOpt(new Date(2026, 10, day))).toBe('mesPassado');
  });

  it.each([13, 14, 20, 30])('dia %i abre no mês atual', (day) => {
    expect(defaultMonthOpt(new Date(2026, 10, day))).toBe('esteMes');
  });

  it('vale em qualquer mês, inclusive o de 31 dias', () => {
    expect(defaultMonthOpt(new Date(2026, 0, 12))).toBe('mesPassado');
    expect(defaultMonthOpt(new Date(2026, 0, 31))).toBe('esteMes');
  });

  it('usa o relógio de agora quando não recebe data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
    expect(defaultMonthOpt()).toBe('mesPassado');
    vi.setSystemTime(new Date(2026, 10, 20, 9, 0));
    expect(defaultMonthOpt()).toBe('esteMes');
    vi.useRealTimers();
  });
});

describe('monthStr', () => {
  it('este mês e mês passado', () => {
    expect(monthStr(0, new Date(2026, 10, 2))).toBe('2026-11');
    expect(monthStr(-1, new Date(2026, 10, 2))).toBe('2026-10');
  });

  it('virada de ano', () => {
    expect(monthStr(-1, new Date(2026, 0, 5))).toBe('2025-12');
  });

  it('dia 29, 30 e 31 não pulam o mês (31/03 menos 1 mês é fevereiro)', () => {
    expect(monthStr(-1, new Date(2026, 2, 31))).toBe('2026-02');
    expect(monthStr(-1, new Date(2026, 4, 31))).toBe('2026-04');
    expect(monthStr(-1, new Date(2026, 9, 31))).toBe('2026-09');
  });
});
