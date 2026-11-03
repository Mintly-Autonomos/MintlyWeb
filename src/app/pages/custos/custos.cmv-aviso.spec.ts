import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustosComponent } from './custos.component';
import { CustosService } from '../../services/custos.service';
import { ToastService } from '../../shared/toast.service';

const history = [{ month: '2026-10', amount: 100 }];

const item = (over: Record<string, unknown>) => ({
  key: 'k',
  name: 'Categoria',
  kind: 'category',
  behavior: 'variable',
  dreGroup: 'opex',
  amount: 100,
  deltaPrevious: null,
  deltaAverage3: null,
  hasAnomaly: false,
  subitems: [],
  history,
  ...over,
});

function dados(cmvAmount: number, items: unknown[]) {
  return {
    referenceMonth: '2026-10',
    revenue: { current: 8130, previous: 5000 },
    total: { current: 15951.77, deltaPrevious: 0.2 },
    cmv: { pctOfRevenue: cmvAmount / 8130, amount: cmvAmount, target: { min: 0.28, max: 0.35 } },
    primeCost: { pctOfRevenue: 1, cmv: cmvAmount, labor: 0, targetMax: 0.65 },
    platformFee: { amount: 0, deltaPrevious: null, pctOfDelivery: null },
    byBehavior: { fixed: 0, variable: 0, mixed: 0 },
    anomalies: [],
    history: [],
    items,
  };
}

describe('CustosComponent — aviso de CMV zerado', () => {
  beforeEach(() => {
    // O jsdom não tem ResizeObserver; o gráfico de linha usa um.
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  function render(data: ReturnType<typeof dados>) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CustosService,
          useValue: {
            data: signal(data),
            loading: signal(false),
            refresh: vi.fn(() => Promise.resolve()),
          },
        },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(CustosComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }

  it('CMV zerado com Fornecedor variável em despesa operacional: avisa', () => {
    const text = render(
      dados(0, [
        item({ key: 'f', name: 'Fornecedor', amount: 2349 }),
        item({ key: 'a', name: 'Aluguel', behavior: 'fixed', amount: 3033.55 }),
      ]),
    );
    expect(text).toContain('Seu CMV está zerado');
    expect(text).toContain('Fornecedor');
    expect(text).toContain('R$ 2.349,00');
  });

  it('quem já está no CMV, na mão de obra ou é taxa de plataforma não entra no aviso', () => {
    const text = render(
      dados(0, [
        item({ key: 'i', name: 'Insumos', dreGroup: 'cmv', amount: 0 }),
        item({ key: 'l', name: 'Salários', dreGroup: 'labor', amount: 900 }),
        item({ key: 'p', name: 'Taxa iFood', kind: 'platformFee', amount: 300 }),
      ]),
    );
    expect(text).not.toContain('Seu CMV está zerado');
  });

  it('com CMV maior que zero não avisa', () => {
    const text = render(dados(2600, [item({ key: 'f', name: 'Fornecedor', amount: 2349 })]));
    expect(text).not.toContain('Seu CMV está zerado');
  });
});
