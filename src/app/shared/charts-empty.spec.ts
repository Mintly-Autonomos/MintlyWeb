import { TestBed } from '@angular/core/testing';
import { AreaChartComponent } from './area-chart.component';
import { BarChartComponent } from './bar-chart.component';
import { LineChartComponent } from './line-chart.component';
import { WaterfallChartComponent } from './waterfall-chart.component';
import { DonutChartComponent } from './donut-chart.component';

interface Vazio {
  hasData: boolean;
}
const criar = <T>(tipo: new () => T, inputs: Record<string, unknown>): T & Vazio => {
  const c = TestBed.createComponent(tipo as never) as unknown as {
    componentInstance: Record<string, unknown>;
  };
  Object.assign(c.componentInstance, inputs);
  return c.componentInstance as unknown as T & Vazio;
};

describe('gráficos sem dados', () => {
  const serie = [{ key: 'v', name: 'Valor', color: 'red' }];

  it('área, barras e linha: tudo zero ou nulo não tem o que desenhar', () => {
    const zeros = [
      { x: 'a', v: 0 },
      { x: 'b', v: null },
    ];
    for (const tipo of [AreaChartComponent, BarChartComponent, LineChartComponent]) {
      const c = criar(tipo as never, { data: zeros, categoryKey: 'x', series: serie });
      expect((c as Vazio).hasData).toBe(false);
    }
  });

  it('área, barras e linha: um valor diferente de zero já desenha', () => {
    const dados = [
      { x: 'a', v: 0 },
      { x: 'b', v: 5 },
    ];
    for (const tipo of [AreaChartComponent, BarChartComponent, LineChartComponent]) {
      const c = criar(tipo as never, { data: dados, categoryKey: 'x', series: serie });
      expect((c as Vazio).hasData).toBe(true);
    }
  });

  it('valores negativos contam como dado (ex.: caixa no vermelho)', () => {
    const c = criar(AreaChartComponent as never, {
      data: [{ x: 'a', v: -10 }],
      categoryKey: 'x',
      series: serie,
    });
    expect((c as Vazio).hasData).toBe(true);
  });

  it('cascata e rosca', () => {
    expect(
      (
        criar(WaterfallChartComponent as never, {
          rows: [{ label: 'a', value: 0, kind: 'start' }],
        }) as Vazio
      ).hasData,
    ).toBe(false);
    expect(
      (
        criar(WaterfallChartComponent as never, {
          rows: [{ label: 'a', value: 10, kind: 'start' }],
        }) as Vazio
      ).hasData,
    ).toBe(true);
    expect(
      (
        criar(DonutChartComponent as never, {
          data: [{ label: 'a', value: 0, color: 'x' }],
        }) as Vazio
      ).hasData,
    ).toBe(false);
    expect(
      (
        criar(DonutChartComponent as never, {
          data: [{ label: 'a', value: 3, color: 'x' }],
        }) as Vazio
      ).hasData,
    ).toBe(true);
  });
});
