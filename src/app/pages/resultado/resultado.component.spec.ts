import { signal } from '@angular/core';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { CategoriasService } from '../../services/categorias.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ResultadoComponent } from './resultado.component';
import { ResultadoService, ResultReport } from '../../services/resultado.service';
import { RestauranteService } from '../../services/restaurante.service';
import { ToastService } from '../../shared/toast.service';

/** Outubro da Alice: R$ 8.130 vendidos, R$ 15.951,77 de custos fixos, prejuízo no fim. */
function report(
  over: Partial<ResultReport['breakEven']> = {},
  netProfit = -13360.16,
  deltas: Partial<ResultReport['deltas']> = {},
  extra: {
    cmv?: number;
    items?: unknown[];
    current?: Record<string, number>;
    comparison?: unknown;
  } = {},
) {
  const current = {
    grossRevenue: 8130,
    taxes: 325.2,
    netRevenue: 7804.8,
    cmv: extra.cmv ?? 0,
    grossMargin: 7804.8,
    operatingExpenses: 21164.96,
    netProfit,
    netMargin: netProfit / 8130,
    nonOperatingIncome: 0,
    nonOperatingExpenses: 0,
    resultAfterNonOperating: netProfit,
    ...extra.current,
  };
  return {
    referenceMonth: '2026-10',
    previousMonth: '2026-09',
    tax: { regime: 'simplesNacionalAnexoI' },
    current,
    previous: { ...current, netMargin: 0.7 },
    deltas: {
      grossRevenue: 0.5,
      taxes: 0,
      netRevenue: 0,
      cmv: null,
      grossMargin: 0.5,
      operatingExpenses: 0.2,
      netProfit: -3.2,
      ...deltas,
    },
    breakEven: {
      fixedCosts: 15951.77,
      variableCosts: 5213.2,
      contributionMarginPct: 0.332,
      breakEvenRevenue: 50041.44,
      reachedOnDay: null,
      ...over,
    },
    insights: [],
    operatingExpenseItems: extra.items ?? [],
    history: [],
    comparison: extra.comparison ?? { kind: 'fullMonth', untilDay: null },
  } as unknown as ResultReport;
}

describe('ResultadoComponent', () => {
  beforeEach(() => {
    // O jsdom não tem ResizeObserver; o gráfico em cascata usa um.
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  function render(data: ResultReport) {
    TestBed.configureTestingModule({
      providers: [
        // Venda acumulada (P.9): sem movimentações, o gráfico não aparece.
        {
          provide: MovimentacoesService,
          useValue: { refresh: vi.fn().mockResolvedValue(undefined), movements: signal([]) },
        },
        {
          provide: CategoriasService,
          useValue: { refresh: vi.fn().mockResolvedValue(undefined), categories: signal([]) },
        },
        provideRouter([]),
        {
          provide: ResultadoService,
          useValue: {
            data: signal(data),
            loading: signal(false),
            refresh: vi.fn(() => Promise.resolve()),
          },
        },
        { provide: RestauranteService, useValue: {} },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ResultadoComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    return { root, text, fixture };
  }

  const bigNumber = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('div')).find((d) => d.className.includes('xl:text-[52px]'));

  it('prejuízo: o número grande sai vermelho, não verde', () => {
    const { root } = render(report());
    expect(bigNumber(root)?.className).toContain('text-error');
    expect(bigNumber(root)?.className).not.toContain('text-success');
  });

  it('lucro: o número grande continua verde', () => {
    const { root } = render(report({}, 1500));
    expect(bigNumber(root)?.className).toContain('text-success');
  });

  /** Linha de variação (seta + %) do card de indicador com esse rótulo. */
  const deltaDo = (root: HTMLElement, rotulo: string) => {
    const card = Array.from(root.querySelectorAll('app-stat-card')).find((c) =>
      c.textContent?.includes(rotulo),
    )!;
    return card.querySelector<HTMLElement>('div.inline-flex.font-semibold')!;
  };

  it('receita que caiu mostra ▼ em vermelho, não ▲ verde', () => {
    const { root } = render(report({}, -13360.16, { grossRevenue: -0.2 }));
    const delta = deltaDo(root, 'Receita bruta');
    expect(delta.textContent).toContain('▼');
    expect(delta.textContent).toContain('20%');
    expect(delta.textContent).not.toContain('-');
    expect(delta.className).toContain('text-error');
  });

  it('receita que subiu mostra ▲ em verde', () => {
    const { root } = render(report({}, 1500, { grossRevenue: 0.5 }));
    const delta = deltaDo(root, 'Receita bruta');
    expect(delta.textContent).toContain('▲');
    expect(delta.className).toContain('text-success');
  });

  it('sem alteração a variação fica neutra: nem verde, nem vermelha, sem seta', () => {
    const { root } = render(report({}, 1500, { grossRevenue: 0 }));
    const delta = deltaDo(root, 'Receita bruta');
    expect(delta.textContent).toContain('0%');
    expect(delta.textContent).not.toMatch(/[▲▼]/);
    expect(delta.className).toContain('text-muted-foreground');
    expect(delta.className).not.toMatch(/text-(success|error|warning)/);
  });

  it('sem dado para comparar (variação nula) a linha da variação nem aparece', () => {
    const { root } = render(report({}, 1500, { grossRevenue: null }));
    const card = Array.from(root.querySelectorAll('app-stat-card')).find((c) =>
      c.textContent?.includes('Receita bruta'),
    )!;
    expect(card.textContent).not.toMatch(/[▲▼]/);
    expect(card.textContent).not.toContain('vs. mês anterior');
  });

  it('o chip de lucro sem variação é neutro e sem dado some', () => {
    const neutro = render(report({}, 1500, { netProfit: 0 }));
    expect(neutro.text()).toContain('Sem variação vs.');
    TestBed.resetTestingModule();
    const semDado = render(report({}, 1500, { netProfit: null }));
    const chips = Array.from(semDado.root.querySelectorAll('app-chip')).map(
      (c) => c.textContent ?? '',
    );
    expect(chips.some((t) => t.includes('vs.'))).toBe(false);
  });

  it('margem bruta e despesas também seguem o sinal da variação', () => {
    const { root } = render(report({}, -13360.16, { grossMargin: -0.1, operatingExpenses: -0.3 }));
    expect(deltaDo(root, 'Margem bruta').textContent).toContain('▼');
    expect(deltaDo(root, 'Despesas operacionais').textContent).toContain('▼');
  });

  describe('aviso de CMV zerado', () => {
    const fornecedor = { name: 'Fornecedor', kind: 'opex', behavior: 'variable', amount: 2349 };
    const aluguel = { name: 'Aluguel', kind: 'opex', behavior: 'fixed', amount: 3033.55 };

    it('CMV zerado com despesa variável em despesa operacional: avisa e aponta o Fornecedor', () => {
      const { text } = render(report({}, -13360.16, {}, { items: [fornecedor, aluguel] }));
      expect(text()).toContain('Seu CMV está zerado');
      expect(text()).toContain('Fornecedor');
      expect(text()).toContain('R$ 2.349,00');
      expect(text()).not.toContain('Aluguel (R$');
      expect(text()).toContain('Ir para Categorias');
    });

    it('só despesa fixa fora do CMV não avisa (aluguel não é insumo)', () => {
      const { text } = render(report({}, -13360.16, {}, { items: [aluguel] }));
      expect(text()).not.toContain('Seu CMV está zerado');
    });

    it('quando já há CMV não avisa', () => {
      const { text } = render(report({}, 1500, {}, { cmv: 2600, items: [fornecedor] }));
      expect(text()).not.toContain('Seu CMV está zerado');
    });

    it('mão de obra e taxa de plataforma não entram no aviso', () => {
      const { text } = render(
        report(
          {},
          -13360.16,
          {},
          {
            items: [
              { name: 'Pró-labore', kind: 'labor', behavior: 'variable', amount: 1000 },
              { name: 'Taxa Keeta', kind: 'platformFee', behavior: 'variable', amount: 500 },
            ],
          },
        ),
      );
      expect(text()).not.toContain('Seu CMV está zerado');
    });
  });

  it('ponto de equilíbrio: a barra mostra quanto já foi vendido, não 100%', () => {
    const { root, text } = render(report());
    const bar = root.querySelector('[role=progressbar]') as HTMLElement;
    // 8.130 / 50.041,44 = 16,2%
    expect(bar.getAttribute('aria-valuenow')).toBe('16');
    const fill = bar.firstElementChild as HTMLElement;
    expect(parseFloat(fill.style.width)).toBeCloseTo(16.25, 1);
    expect(fill.className).toContain('bg-warning');
    expect(text()).toMatch(/Vendido: R\$ 8\.130,00 de R\$ 50\.041,44/);
  });

  it('ponto de equilíbrio: mostra a conta (custos fixos ÷ margem de contribuição)', () => {
    const { text } = render(report());
    // 15.951,77 / 50.041,44 = 31,9%
    expect(text()).toMatch(
      /custos fixos R\$ 15\.951,77 ÷ margem de contribuição 31,9% = R\$ 50\.041,44/,
    );
  });

  it('ponto de equilíbrio atingido: barra cheia e verde', () => {
    const { root } = render(report({ breakEvenRevenue: 6000, fixedCosts: 3000, reachedOnDay: 20 }));
    const fill = (root.querySelector('[role=progressbar]') as HTMLElement)
      .firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
    expect(fill.className).toContain('bg-mint');
  });

  it('sem ponto de equilíbrio explica o motivo em vez de mostrar uma barra', () => {
    const { root, text } = render(
      report({ breakEvenRevenue: null, contributionMarginPct: null, fixedCosts: 15951.77 }),
    );
    expect(root.querySelector('[role=progressbar]')).toBeNull();
    expect(text()).toContain('custos variáveis consomem toda a venda');
  });

  describe('mês parcial (relatório S2.6)', () => {
    it('mês em andamento: selo e variações "vs. dias 1 a N" do mês anterior', () => {
      const { root, text } = render(
        report({}, 1500, {}, { comparison: { kind: 'samePeriod', untilDay: 4 } }),
      );
      expect(root.querySelector('[data-testid=mes-parcial]')?.textContent).toContain(
        'Mês parcial: até o dia 4',
      );
      expect(text()).toContain('vs. dias 1 a 4 de Setembro/2026');
      expect(text()).not.toContain('vs. mês anterior');
    });

    it('mês fechado: sem selo, compara com o mês anterior pelo nome', () => {
      const { root, text } = render(report({}, 1500));
      expect(root.querySelector('[data-testid=mes-parcial]')).toBeNull();
      expect(text()).toContain('vs. Setembro/2026');
    });
  });

  describe('não operacional e regime (relatório: DRE e Anexo II)', () => {
    it('sem não operacional o DRE termina em "Resultado do mês"', () => {
      const { text } = render(report());
      expect(text()).toContain('Resultado do mês');
      expect(text()).not.toContain('Entradas não operacionais');
    });

    it('com empréstimo e equipamento: linhas separadas depois do lucro operacional', () => {
      const { text } = render(
        report(
          {},
          1500,
          {},
          {
            current: {
              nonOperatingIncome: 10000,
              nonOperatingExpenses: 4000,
              resultAfterNonOperating: 7500,
            },
          },
        ),
      );
      const t = text();
      expect(t).toContain('Resultado operacional (lucro do mês)');
      expect(t).toContain('Entradas não operacionais');
      expect(t).toContain('(−) Saídas não operacionais');
      expect(t).toContain('Resultado depois do não operacional');
      expect(t.indexOf('Resultado operacional')).toBeLessThan(
        t.indexOf('Entradas não operacionais'),
      );
      expect(t).toMatch(/Resultado depois do não operacional.*R\$\s?7\.500,00/);
    });

    it('regime já configurado continua clicável para trocar, inclusive para o Anexo II', async () => {
      const { root, fixture } = render(report());
      const restaurante = TestBed.inject(RestauranteService) as unknown as {
        updateTaxRegime: ReturnType<typeof vi.fn>;
      };
      restaurante.updateTaxRegime = vi.fn(() => Promise.resolve());
      const toast = TestBed.inject(ToastService) as unknown as {
        success: ReturnType<typeof vi.fn>;
      };

      const chip = root.querySelector<HTMLButtonElement>('[data-testid=trocar-regime]');
      expect(chip?.textContent).toContain('Anexo I');
      chip!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      await (
        fixture.componentInstance as unknown as { setRegime(r: string): Promise<void> }
      ).setRegime('simplesNacionalAnexoII');
      expect(restaurante.updateTaxRegime).toHaveBeenCalledWith('simplesNacionalAnexoII');
      expect(toast.success).toHaveBeenCalledWith('Regime tributário alterado.');
    });
  });
});
