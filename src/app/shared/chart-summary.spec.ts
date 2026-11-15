import { TestBed } from '@angular/core/testing';
import { BarChartComponent } from './bar-chart.component';
import { itemsSummary, seriesSummary } from './chart-summary';

const brl = (v: number) => `R$ ${v}`;

describe('texto alternativo dos gráficos (relatório R4.9)', () => {
  it('séries viram frase com cada ponto', () => {
    const data = [
      { mes: 'set', lucro: 100, margem: 10 },
      { mes: 'out', lucro: -50, margem: -5 },
    ];
    expect(
      seriesSummary(
        'Gráfico de barras',
        data,
        'mes',
        [
          { key: 'lucro', name: 'Lucro' },
          { key: 'margem', name: 'Margem' },
        ],
        brl,
      ),
    ).toBe('Gráfico de barras. Lucro: set R$ 100, out R$ -50; Margem: set R$ 10, out R$ -5');
  });

  it('muitos pontos: só os últimos, avisando quantos', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ d: String(i + 1), v: i }));
    const t = seriesSummary('Gráfico de linhas', data, 'd', [{ key: 'v', name: 'Vendas' }], brl, 3);
    expect(t).toBe('Gráfico de linhas (últimos 3 de 20). Vendas: 18 R$ 17, 19 R$ 18, 20 R$ 19');
  });

  it('sem dados diz isso em vez de ficar mudo', () => {
    expect(seriesSummary('Gráfico de área', [], 'x', [{ key: 'v', name: 'V' }], brl)).toBe(
      'Gráfico de área sem dados',
    );
    expect(itemsSummary('Gráfico de rosca', [], brl)).toBe('Gráfico de rosca sem dados');
  });

  it('o svg do gráfico de barras tem role=img e o resumo', () => {
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
    const fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentInstance.data = [{ mes: 'out', lucro: 1500 }];
    fixture.componentInstance.categoryKey = 'mes';
    fixture.componentInstance.series = [{ key: 'lucro', name: 'Lucro', color: 'red' }];
    fixture.componentInstance.valueFormatter = brl;
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Gráfico de barras. Lucro: out R$ 1500');
  });
});
