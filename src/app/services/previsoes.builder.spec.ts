import {
  AJUSTES_ZERO,
  PASSADO,
  PrevMov,
  addDays,
  ajustesDe,
  ALAVANCAS_ZERO,
  buildBase,
  conciliar,
  simular,
} from './previsoes.builder';

const HOJE = '2026-10-28';

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

describe('buildBase', () => {
  it('o ritmo de vendas conta TUDO o que foi vendido nos últimos 30 dias, inclusive cartão e iFood', () => {
    const base = buildBase(
      [
        mov({ valor: 3000 }),
        mov({ tipo: 'out', valor: 600, variavel: 1 }),
        mov({ tipo: 'out', valor: 300, variavel: 0 }),
        // venda no cartão (repasse em 30 dias), já recebida: entra no ritmo pela data da venda
        mov({
          valor: 600,
          aVista: false,
          prazo: 30,
          date: addDays(HOJE, -1),
          lancamento: addDays(HOJE, -20),
        }),
        // venda no iFood ainda pendente (repasse em 7 dias): também é venda do período
        mov({
          valor: 300,
          pendente: true,
          prazo: 7,
          date: addDays(HOJE, 5),
          lancamento: addDays(HOJE, -2),
        }),
        // vendida antes da janela: fora
        mov({ valor: 9999, date: addDays(HOJE, -PASSADO), lancamento: addDays(HOJE, -PASSADO) }),
      ],
      1000,
      0,
      HOJE,
    );
    expect(base.receitaDia).toBe((3000 + 600 + 300) / PASSADO);
    expect(base.receitaPrazos).toEqual([
      { prazo: 0, porDia: 100 },
      { prazo: 7, porDia: 10 },
      { prazo: 30, porDia: 20 },
    ]);
    expect(base.custoVarDia).toBe(20);
    expect(base.custoFixoDia).toBe(10);
    expect(base.temDados).toBe(true);
  });

  it('empréstimo, aporte e equipamento (não operacional) não entram no ritmo de vendas nem de custos', () => {
    const base = buildBase(
      [
        mov({ valor: 3000 }),
        mov({ valor: 15000, naoOperacional: true }),
        mov({ tipo: 'out', valor: 3850, variavel: 0, naoOperacional: true }),
      ],
      0,
      0,
      HOJE,
    );
    expect(base.receitaDia).toBe(100);
    expect(base.custoFixoDia).toBe(0);
    // mas o dinheiro entrou e saiu de verdade: o caixa realizado continua com eles
    expect(base.realizado[HOJE]).toBe(3000 + 15000 - 3850);
  });

  it('pendente vencido vira amanhã; pendente futuro mantém a data', () => {
    const base = buildBase(
      [
        mov({ pendente: true, date: '2026-10-20', valor: 50 }),
        mov({ pendente: true, date: '2026-11-15', valor: 70 }),
      ],
      0,
      0,
      HOJE,
    );
    expect(base.pendentes.map((p) => p.date)).toEqual(['2026-10-29', '2026-11-15']);
  });

  it('sem lançamentos não tem dados', () => {
    expect(buildBase([], 0, 0, HOJE).temDados).toBe(false);
  });
});

describe('simular: vendas com repasse', () => {
  it('a venda com repasse em 30 dias só vira dinheiro depois do prazo (antes disso estão os repasses pendentes)', () => {
    const base = buildBase([mov({ valor: 3000, aVista: false, prazo: 30 })], 0, 0, HOJE);
    expect(simular(AJUSTES_ZERO, 30, base).resultado.entradas).toBe(0);
    expect(simular(AJUSTES_ZERO, 60, base).resultado.entradas).toBeCloseTo(3000, 6);
    expect(simular(AJUSTES_ZERO, 90, base).resultado.entradas).toBeCloseTo(6000, 6);
    // P.9: pela data da venda, os 30 dias faturam 3.000 mesmo sem o dinheiro ter chegado.
    expect(simular(AJUSTES_ZERO, 30, base).resultado.receita).toBeCloseTo(3000, 6);
  });

  it('à vista entra todo dia; o simulador de preço e volume vale para as duas partes', () => {
    const base = buildBase(
      [mov({ valor: 3000 }), mov({ valor: 3000, aVista: false, prazo: 1 })],
      0,
      0,
      HOJE,
    );
    expect(simular(AJUSTES_ZERO, 30, base).resultado.entradas).toBeCloseTo(3000 + 2900, 6);
    expect(simular({ ...AJUSTES_ZERO, volume: 10 }, 30, base).resultado.entradas).toBeCloseTo(
      (3000 + 2900) * 1.1,
      6,
    );
  });
});

describe('simular: lucro sem o não operacional', () => {
  it('parcela de empréstimo pendente mexe no caixa, mas não no lucro previsto', () => {
    const base = buildBase(
      [
        mov({ valor: 3000 }),
        mov({
          pendente: true,
          tipo: 'out',
          date: addDays(HOJE, 5),
          valor: 1500,
          naoOperacional: true,
          lancamento: addDays(HOJE, -40),
        }),
      ],
      10_000,
      0,
      HOJE,
    );
    const sem = simular(
      AJUSTES_ZERO,
      30,
      buildBase([mov({ valor: 3000 })], 10_000, 0, HOJE),
    ).resultado;
    const com = simular(AJUSTES_ZERO, 30, base).resultado;
    expect(com.lucro).toBe(sem.lucro);
    expect(com.caixaFim).toBe(sem.caixaFim - 1500);
  });
});

describe('simular', () => {
  const base = buildBase(
    [
      mov({ valor: 3000 }),
      mov({ tipo: 'out', valor: 600, variavel: 1 }),
      // lançados antes da janela, com vencimento no futuro: só contam como pendentes
      mov({ pendente: true, date: addDays(HOJE, 10), valor: 1000, lancamento: addDays(HOJE, -40) }),
      mov({
        pendente: true,
        tipo: 'out',
        date: addDays(HOJE, 100),
        valor: 5000,
        lancamento: addDays(HOJE, -40),
      }),
    ],
    2000,
    0,
    HOJE,
  );

  it('soma o ritmo e o que já está lançado dentro do horizonte; ignora o que vence depois', () => {
    const { resultado } = simular(AJUSTES_ZERO, 30, base);
    // 30 dias de ritmo (100/dia) + 1.000 a receber
    expect(resultado.entradas).toBe(4000);
    // P.9: o lucro é pela venda: 3.000 vendidos no período − 600 de custo; o 1.000 a receber é de venda antiga (só caixa).
    expect(resultado.receita).toBe(3000);
    // 30 dias de custo variável (20/dia); a saída de 5.000 vence depois de 30 dias
    expect(resultado.custoVariavel).toBe(600);
    expect(resultado.lucro).toBe(2400);
  });

  it('o horizonte de 90 dias ainda não alcança um vencimento em 100 dias', () => {
    const { resultado } = simular(AJUSTES_ZERO, 90, base);
    expect(resultado.custoFixo).toBe(0);
    expect(resultado.entradas).toBe(10000);
  });

  it('as alavancas mexem só no ritmo, não no que já está lançado', () => {
    const { resultado } = simular({ ...AJUSTES_ZERO, volume: 10 }, 30, base);
    // ritmo 3.000 * 1,10 + 1.000 já lançado
    expect(resultado.entradas).toBe(4300);
    expect(resultado.custoVariavel).toBe(660);
  });

  it('preço e custo afetam receita e custo variável do ritmo', () => {
    expect(simular({ ...AJUSTES_ZERO, preco: 10 }, 30, base).resultado.entradas).toBe(4300);
    expect(simular({ ...AJUSTES_ZERO, custo: -50 }, 30, base).resultado.custoVariavel).toBe(300);
  });

  it('o caixa final parte do saldo de hoje', () => {
    const vazia = buildBase(
      [mov({ pendente: true, date: addDays(HOJE, 5), valor: 500, lancamento: addDays(HOJE, -40) })],
      1000,
      0,
      HOJE,
    );
    const { resultado } = simular(AJUSTES_ZERO, 30, vazia);
    expect(resultado.caixaFim).toBe(1500);
    expect(resultado.caixaMinimo).toBe(1000);
  });

  it('sem dados devolve zeros, sem NaN', () => {
    const { resultado } = simular(AJUSTES_ZERO, 30, buildBase([], 0, 0, HOJE));
    expect(resultado.lucro).toBe(0);
    expect(resultado.margem).toBe(0);
    expect(Number.isNaN(resultado.caixaFim)).toBe(false);
  });
});

describe('lucro pela venda, caixa pelo dinheiro (P.9)', () => {
  it('o lucro realizado dos últimos 30 dias é pela data da venda; o caixa, pela data do dinheiro', () => {
    const base = buildBase(
      [
        // Vendida há 5 dias, cai na conta daqui a 25 (cartão): é lucro de agora, caixa só depois.
        mov({
          valor: 1000,
          pendente: true,
          aVista: false,
          prazo: 30,
          lancamento: addDays(HOJE, -5),
          date: addDays(HOJE, 25),
        }),
        // Empréstimo recebido ontem: caixa, não lucro.
        mov({
          valor: 5000,
          lancamento: addDays(HOJE, -1),
          date: addDays(HOJE, -1),
          naoOperacional: true,
        }),
        // Conta de luz paga anteontem: sai dos dois.
        mov({ tipo: 'out', valor: 200, lancamento: addDays(HOJE, -2), date: addDays(HOJE, -2) }),
      ],
      0,
      0.1,
      HOJE,
    );
    expect(base.realizadoLucro![addDays(HOJE, -5)]).toBe(900); // 1.000 − 10% de imposto
    expect(base.realizadoLucro![addDays(HOJE, -1)]).toBeUndefined();
    expect(base.realizadoLucro![addDays(HOJE, -2)]).toBe(-200);
    expect(base.realizado[addDays(HOJE, -1)]).toBe(5000);
    expect(base.realizado[addDays(HOJE, -5)]).toBeUndefined();
  });

  it('o imposto da conciliação com o Fluxo segue o caixa', () => {
    const base = buildBase([mov({ valor: 3000, aVista: false, prazo: 30 })], 0, 0.1, HOJE);
    const r = simular(AJUSTES_ZERO, 30, base).resultado;
    expect(r.entradas).toBe(0);
    expect(r.impostosCaixa).toBe(0);
    expect(r.impostos).toBeCloseTo(300, 6);
    expect(conciliar(base, 30, 0).imposto).toBe(0);
  });
});

describe('ajustesDe', () => {
  it('cenário fraco/cheio vira ±25% de vendas', () => {
    expect(ajustesDe({ ...ALAVANCAS_ZERO, cenario: 'fraco' }, 'cenario').volume).toBe(-25);
    expect(ajustesDe({ ...ALAVANCAS_ZERO, cenario: 'cheio' }, 'cenario').volume).toBe(25);
  });
});
