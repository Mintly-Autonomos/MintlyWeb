import { dasMeiImplausivel, impostoDoResultado, impostoFixoNaJanela } from './imposto-mes';

// Reteste 22/11, T1: o imposto do MEI é o DAS fixo do mês, igual em todas as telas.
describe('impostoDoResultado', () => {
  const cur = (taxes: number, grossRevenue: number) => ({ taxes, grossRevenue }) as never;

  it('MEI: o DAS do mês como valor fixo, nunca uma fração da venda', () => {
    const r = { tax: { regime: 'mei', effectiveRate: null }, current: cur(81.05, 145) } as never;
    expect(impostoDoResultado(r)).toEqual({ aliquota: 0, fixoMes: 81.05 });
  });

  it('Simples: a alíquota efetiva do regime', () => {
    const r = {
      tax: { regime: 'simplesNacionalAnexoI', effectiveRate: 0.0612 },
      current: cur(600, 10000),
    } as never;
    expect(impostoDoResultado(r)).toEqual({ aliquota: 0.0612, fixoMes: 0 });
  });

  it('sem regime nem relatório: sem imposto', () => {
    expect(impostoDoResultado(null)).toEqual({ aliquota: 0, fixoMes: 0 });
    const r = { tax: { regime: null, effectiveRate: null }, current: cur(0, 1000) } as never;
    expect(impostoDoResultado(r)).toEqual({ aliquota: 0, fixoMes: 0 });
  });
});

describe('impostoFixoNaJanela', () => {
  it('mês do calendário (inteiro ou até hoje): o DAS do mês inteiro, como o Resultado', () => {
    expect(impostoFixoNaJanela(81, '2026-11-01', '2026-11-22')).toBe(81);
    expect(impostoFixoNaJanela(81, '2026-10-01', '2026-10-31')).toBe(81);
  });

  it('outras janelas: proporcional aos dias', () => {
    expect(impostoFixoNaJanela(90, '2026-11-16', '2026-11-22')).toBe(21);
    expect(impostoFixoNaJanela(90, '2026-10-24', '2026-11-22')).toBe(90);
    expect(impostoFixoNaJanela(0, '2026-11-01', '2026-11-22')).toBe(0);
  });
});

describe('dasMeiImplausivel (sugestão da testadora, 23/11)', () => {
  it('DAS-MEI de R$ 2.248 avisa; R$ 82 não; Simples nunca', () => {
    expect(dasMeiImplausivel({ regime: 'mei', meiMonthlyDas: 2248.08 })).toBe(true);
    expect(dasMeiImplausivel({ regime: 'mei', meiMonthlyDas: 82.05 })).toBe(false);
    expect(dasMeiImplausivel({ regime: 'mei', meiMonthlyDas: null })).toBe(false);
    expect(dasMeiImplausivel({ regime: 'simplesNacionalAnexoI', meiMonthlyDas: 5000 })).toBe(false);
  });
});
