import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BarChartComponent, BarSeries } from './bar-chart.component';
import { WaterfallChartComponent, WaterfallRow } from './waterfall-chart.component';

/**
 * Regressão do relatório (rodada 3/4): ao trocar o período, os gráficos mantinham o eixo e as barras do período
 * anterior; na cascata, rótulos de um mês com barras de outro e "TypeError: reading 'hi'". Os computed() liam
 * @Input comum, que não avisa a mudança.
 */
@Component({
  standalone: true,
  imports: [WaterfallChartComponent, BarChartComponent],
  template: `
    <app-waterfall-chart [rows]="rows()" />
    <app-bar-chart [data]="data()" categoryKey="nome" [series]="series" />
  `,
})
class HostComponent {
  rows = signal<WaterfallRow[]>([
    { label: 'Receita Bruta', value: 1000, kind: 'start' },
    { label: 'CMV', value: -400, kind: 'down' },
    { label: 'Lucro Líquido', value: 600, kind: 'end' },
  ]);
  data = signal<Record<string, unknown>[]>([{ nome: 'Nov', valor: 9_000 }]);
  series: BarSeries[] = [{ key: 'valor', name: 'Receita', color: 'red' }];
}

describe('Gráficos: trocar os dados redesenha (eixo, barras e rótulos)', () => {
  beforeAll(() => {
    // O jsdom não tem ResizeObserver; o tamanho fica no padrão do componente.
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // jsdom: sem medição de tamanho
      }
      unobserve(): void {
        // jsdom: sem medição de tamanho
      }
      disconnect(): void {
        // jsdom: sem medição de tamanho
      }
    } as unknown as typeof ResizeObserver;
  });

  it('cascata: troca de 3 para 5 etapas sem erro e com os rótulos novos', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    host.rows.set([
      { label: 'Receita Bruta', value: 38_600, kind: 'start' },
      { label: 'Impostos', value: -2_400, kind: 'down' },
      { label: 'CMV', value: -12_000, kind: 'down' },
      { label: 'Desp. operacionais', value: -43_643, kind: 'down' },
      { label: 'Lucro Líquido', value: -19_443, kind: 'end' },
    ]);
    expect(() => fixture.detectChanges()).not.toThrow();
    const text =
      (fixture.nativeElement as HTMLElement).querySelector('app-waterfall-chart')!.textContent ??
      '';
    expect(text).toContain('Desp. operacionais');
    expect(text).toContain('Impostos');
    const wf = fixture.debugElement.children[0].componentInstance as unknown as {
      bars(): { label: string; color: string }[];
    };
    expect(wf.bars().map((b) => b.label)).toEqual([
      'Receita Bruta',
      'Impostos',
      'CMV',
      'Desp. operacionais',
      'Lucro Líquido',
    ]);
    // prejuízo no fim: barra vermelha (antes aparecia "para cima")
    expect(wf.bars().at(-1)!.color).toBe('var(--error)');
  });

  it('barras: o eixo acompanha o período novo (outubro 38,6 mil não estoura o eixo de novembro 9 mil)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const bar = fixture.debugElement.children[1].componentInstance as unknown as {
      scale(): { max: number };
    };
    const antes = bar.scale().max;
    fixture.componentInstance.data.set([{ nome: 'Out', valor: 38_600 }]);
    fixture.detectChanges();
    expect(bar.scale().max).toBeGreaterThanOrEqual(38_600);
    expect(bar.scale().max).toBeGreaterThan(antes);
  });
});
