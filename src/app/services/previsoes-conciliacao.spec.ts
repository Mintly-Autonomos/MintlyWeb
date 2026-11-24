import { PrevMov, addDays, buildBase, conciliar } from './previsoes.builder';

const HOJE = '2026-11-15';

const mov = (over: Partial<PrevMov>): PrevMov => ({
  tipo: 'in',
  date: HOJE,
  valor: 100,
  pendente: false,
  variavel: 0,
  aVista: true,
  lancamento: HOJE,
  prazo: 0,
  naoOperacional: false,
  ...over,
});

describe('conciliar: do Fluxo de caixa (só o lançado) até o caixa das Previsões (relatório S2.2)', () => {
  const movs = [
    // ritmo: R$ 3.000 de vendas e R$ 900 de custos à vista nos últimos 30 dias
    mov({ valor: 3000, date: addDays(HOJE, -3), lancamento: addDays(HOJE, -3) }),
    mov({ tipo: 'out', valor: 600, variavel: 1, date: addDays(HOJE, -2) }),
    mov({ tipo: 'out', valor: 300, variavel: 0, date: addDays(HOJE, -2) }),
    // já lançado para o futuro: repasse de R$ 500 em 10 dias e aluguel de R$ 1.200 em 20
    mov({
      valor: 500,
      pendente: true,
      aVista: false,
      date: addDays(HOJE, 10),
      prazo: 30,
      lancamento: addDays(HOJE, -20),
    }),
    mov({ tipo: 'out', valor: 1200, pendente: true, aVista: false, date: addDays(HOJE, 20) }),
  ];
  const caixaHoje = 10_000;
  const base = buildBase(movs, caixaHoje, 0.06, HOJE);
  // O Fluxo de caixa no dia 30: caixa de hoje + o que já está lançado (a receber − a pagar).
  const fluxo30 = caixaHoje + 500 - 1200;

  it('as parcelas fecham exatamente com o caixa previsto', () => {
    const c = conciliar(base, 30, fluxo30);
    expect(c.lancado + c.ritmoVendas - c.ritmoCustos - c.imposto + c.ajustes).toBeCloseTo(
      c.previsao,
      2,
    );
  });

  it('com o mesmo lançado das duas telas, a diferença é só ritmo e imposto (sem "outros ajustes")', () => {
    const c = conciliar(base, 30, fluxo30);
    expect(c.lancado).toBe(9_300);
    // R$ 20/dia de variável × 30 + o fixo de R$ 10/dia só nos 15 dias de novembro: dezembro já tem o aluguel lançado
    // (R$ 1.200), que não entra de novo pelo ritmo (problemas 23/11, item 1).
    expect(c.ritmoCustos).toBeCloseTo(750, 2);
    // R$ 100/dia à vista × 30; a venda com prazo de 30 dias só viraria dinheiro a partir do dia 31
    expect(c.ritmoVendas).toBeCloseTo(3_000, 2);
    expect(c.imposto).toBeCloseTo(0.06 * (c.ritmoVendas + 500), 2); // imposto do ritmo e do repasse lançado
    expect(Math.abs(c.ajustes)).toBeLessThan(0.01);
  });

  it('conta vencida: as Previsões a jogam para amanhã e o Fluxo para hoje; no fim do horizonte dá o mesmo', () => {
    const comVencida = buildBase(
      [
        ...movs,
        mov({ tipo: 'out', valor: 400, pendente: true, aVista: false, date: addDays(HOJE, -5) }),
      ],
      caixaHoje,
      0.06,
      HOJE,
    );
    const c = conciliar(comVencida, 30, fluxo30 - 400);
    expect(Math.abs(c.ajustes)).toBeLessThan(0.01);
  });

  it('se o lançado do Fluxo for diferente (ex.: caixa de hoje de outra fonte), a diferença aparece em "ajustes"', () => {
    const c = conciliar(base, 30, fluxo30 - 250);
    expect(c.ajustes).toBeCloseTo(250, 2);
  });
});
