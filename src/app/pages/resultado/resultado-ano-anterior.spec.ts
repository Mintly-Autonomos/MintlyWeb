import { signal } from '@angular/core';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { CategoriasService } from '../../services/categorias.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ResultadoComponent } from './resultado.component';
import { ResultadoService, ResultReport } from '../../services/resultado.service';
import { RestauranteService } from '../../services/restaurante.service';
import { ToastService } from '../../shared/toast.service';
import { monthStr } from '../../shared/month-select';

const linhas = (grossRevenue: number, netProfit: number) => ({
  grossRevenue,
  taxes: 0,
  netRevenue: grossRevenue,
  cmv: 0,
  grossMargin: grossRevenue,
  operatingExpenses: grossRevenue - netProfit,
  netProfit,
  netMargin: grossRevenue ? netProfit / grossRevenue : null,
  nonOperatingIncome: 0,
  nonOperatingExpenses: 0,
  resultAfterNonOperating: netProfit,
});

function report(referenceMonth: string, previousYear: unknown = null): ResultReport {
  const current = linhas(30_000, 3_000);
  return {
    referenceMonth,
    previousMonth: referenceMonth,
    tax: { regime: 'simplesNacionalAnexoI' },
    current,
    previous: current,
    deltas: {},
    breakEven: {
      fixedCosts: 0,
      variableCosts: 0,
      contributionMarginPct: null,
      breakEvenRevenue: null,
      reachedOnDay: null,
    },
    insights: [],
    operatingExpenseItems: [],
    history: [],
    comparison: { kind: 'fullMonth', untilDay: null },
    previousYear,
  } as unknown as ResultReport;
}

describe('Resultado: meses futuros, 6/12 meses e o mesmo mês do ano anterior (relatório U.4)', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  function render(data: ResultReport) {
    const refresh = vi.fn(() => Promise.resolve());
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
          useValue: { data: signal(data), loading: signal(false), refresh },
        },
        { provide: RestauranteService, useValue: {} },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ResultadoComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const q = (id: string) => root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const text = (id: string) => (q(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { fixture, root, q, text, refresh };
  }

  it('mês futuro: selo dizendo que só aparece o já lançado', () => {
    const { q, text } = render(report(monthStr(2)));
    expect(q('mes-futuro')).not.toBeNull();
    expect(text('mes-futuro')).toContain('Mês futuro: só o que já está lançado');
  });

  it('mês atual ou passado: sem o selo de futuro', () => {
    expect(render(report(monthStr(-1))).q('mes-futuro')).toBeNull();
  });

  it('com o mesmo mês do ano anterior: receita e lucro de lá e a variação de agora', () => {
    const { text } = render(
      report('2026-10', {
        month: '2025-10',
        lines: linhas(20_000, 4_000),
        deltas: { grossRevenue: 0.5, netProfit: -0.25 },
      }),
    );
    const t = text('ano-anterior');
    expect(t).toContain('Mesmo mês do ano passado (Outubro/2025)');
    expect(t).toMatch(/Receita R\$\s?20\.000,00 · agora ▲ 50%/);
    expect(t).toMatch(/Lucro R\$\s?4\.000,00 · agora ▼ 25%/);
  });

  it('sem lançamento no ano anterior: nada de bloco', () => {
    expect(render(report('2026-10')).q('ano-anterior')).toBeNull();
  });

  it('abre em 12 meses (P.9); "6 meses" recarrega com historyMonths 6 e muda o título', () => {
    const { fixture, q, root, refresh } = render(report('2026-10'));
    expect((refresh.mock.calls.at(-1) as unknown[])[1]).toBe(12);
    expect(root.textContent).toContain('Seu resultado em 12 meses');
    q('historico-6')!.click();
    fixture.detectChanges();
    expect((refresh.mock.calls.at(-1) as unknown[])[1]).toBe(6);
    expect(root.textContent).toContain('Seu resultado em 6 meses');
  });
});
