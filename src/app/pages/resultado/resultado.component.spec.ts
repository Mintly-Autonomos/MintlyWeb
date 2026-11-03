import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ResultadoComponent } from './resultado.component';
import { ResultadoService, ResultReport } from '../../services/resultado.service';
import { RestauranteService } from '../../services/restaurante.service';
import { ToastService } from '../../shared/toast.service';

/** Outubro da Alice: R$ 8.130 vendidos, R$ 15.951,77 de custos fixos, prejuízo no fim. */
function report(over: Partial<ResultReport['breakEven']> = {}, netProfit = -13360.16) {
  const current = {
    grossRevenue: 8130,
    taxes: 325.2,
    netRevenue: 7804.8,
    cmv: 0,
    grossMargin: 7804.8,
    operatingExpenses: 21164.96,
    netProfit,
    netMargin: netProfit / 8130,
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
    operatingExpenseItems: [],
    history: [],
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
    return { root, text };
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
});
