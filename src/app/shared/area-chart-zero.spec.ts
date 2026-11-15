import { TestBed } from '@angular/core/testing';
import { AreaChartComponent } from './area-chart.component';

interface Interno {
  valueTicks(): { label: string; value?: number }[];
}

describe('Gráfico de área: eixo a partir do zero (relatório U.5)', () => {
  function montar(zeroBaseline: boolean) {
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
    const fixture = TestBed.createComponent(AreaChartComponent);
    const c = fixture.componentInstance;
    c.data = [
      { m: 'jun', receita: 32000 },
      { m: 'jul', receita: 41000 },
      { m: 'ago', receita: 48000 },
    ];
    c.categoryKey = 'm';
    c.series = [{ key: 'receita', name: 'Receita', color: 'red' }];
    c.valueFormatter = (v) => String(v);
    c.zeroBaseline = zeroBaseline;
    fixture.detectChanges();
    return c as unknown as Interno;
  }

  it('com zeroBaseline o eixo começa em 0 (receita de 32 a 48 mil não parece triplicar)', () => {
    const labels = montar(true)
      .valueTicks()
      .map((t) => t.label);
    expect(labels).toContain('0');
  });

  it('sem zeroBaseline (saldo de caixa) o eixo se ajusta aos dados, como antes', () => {
    const labels = montar(false)
      .valueTicks()
      .map((t) => t.label);
    expect(labels).not.toContain('0');
  });
});
