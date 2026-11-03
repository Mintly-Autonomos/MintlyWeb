import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CustosComponent } from './custos.component';
import { CustosService } from '../../services/custos.service';
import { ToastService } from '../../shared/toast.service';

const history = [{ month: '2026-10', amount: 100 }];

/** Duas categorias: Salários (sem subcategoria) e Fornecedor (com itens). */
const data = {
  referenceMonth: '2026-10',
  revenue: { current: 8130, previous: 5000 },
  total: { current: 15951.77, deltaPrevious: 0.2 },
  cmv: { pctOfRevenue: 0.3, amount: 100, target: { min: 0.28, max: 0.35 } },
  primeCost: { pctOfRevenue: 1.5, cmv: 0, labor: 100, targetMax: 0.65 },
  platformFee: { amount: 0, deltaPrevious: null, pctOfDelivery: null },
  byBehavior: { fixed: 12918.22, variable: 3033.55, mixed: 0 },
  anomalies: [],
  history: [],
  items: [
    {
      key: 'salarios',
      name: 'Salários',
      kind: 'category',
      behavior: 'fixed',
      amount: 12918.22,
      deltaPrevious: null,
      deltaAverage3: null,
      hasAnomaly: false,
      subitems: [],
      history,
    },
    {
      key: 'fornecedor',
      name: 'Fornecedor',
      kind: 'category',
      behavior: 'variable',
      amount: 3033.55,
      deltaPrevious: 0.1,
      deltaAverage3: 0.1,
      hasAnomaly: false,
      subitems: [
        {
          key: 'carne',
          name: 'Carne',
          amount: 3033.55,
          anomaly: false,
          deltaPrevious: 0.1,
          deltaAverage3: 0.1,
        },
      ],
      history,
    },
  ],
};

describe('CustosComponent — Para onde está indo seu dinheiro', () => {
  beforeEach(() => {
    // O jsdom não tem ResizeObserver; o gráfico de linha usa um.
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  function render() {
    const refresh = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CustosService,
          useValue: { data: signal(data), loading: signal(false), refresh },
        },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(CustosComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const rowButton = (nome: string) =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('#custos-onde button')).find((b) =>
        b.textContent?.includes(nome),
      )!;
    return { fixture, root, refresh, rowButton };
  }

  it('categoria sem itens não é clicável, não tem seta e não abre nada', () => {
    const { fixture, rowButton } = render();
    const salarios = rowButton('Salários');
    expect(salarios.disabled).toBe(true);
    expect(salarios.textContent).not.toContain('expand_more');
    expect(salarios.hasAttribute('aria-expanded')).toBe(false);

    salarios.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('As setas mostram quanto cada item');
  });

  it('categoria com itens continua abrindo e mostra os itens', () => {
    const { fixture, rowButton } = render();
    const fornecedor = rowButton('Fornecedor');
    expect(fornecedor.disabled).toBe(false);
    expect(fornecedor.textContent).toContain('expand_more');

    fornecedor.click();
    fixture.detectChanges();
    expect(fornecedor.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Carne');
  });

  it('não tem mais o filtro de canal (Salão / Delivery) e carrega só pelo mês', () => {
    const { root, refresh } = render();
    expect(root.querySelector('[aria-label="Canal"]')).toBeNull();
    const text = root.textContent ?? '';
    expect(text).not.toContain('Salão');
    expect(text).not.toContain('Delivery');
    // Só o mês (o padrão depende do dia do mês); nenhum segundo argumento de canal.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0] as unknown[]).toHaveLength(1);
  });
});
