import { TestBed } from '@angular/core/testing';
import { WaterfallChartComponent, WaterfallRow, waterfallSpans } from './waterfall-chart.component';

/** Outubro da Alice: vendeu pouco, gastou muito. */
const PREJUIZO: WaterfallRow[] = [
  { label: 'Receita bruta', value: 8130, kind: 'start' },
  { label: 'Impostos', value: -325, kind: 'down' },
  { label: 'CMV', value: 0, kind: 'down' },
  { label: 'Desp. operacionais', value: -21165, kind: 'down' },
  { label: 'Resultado', value: -13360, kind: 'end' },
];

describe('waterfallSpans', () => {
  it('cada etapa flutua entre o total de antes e o de depois', () => {
    const [receita, impostos, cmv, desp, resultado] = waterfallSpans(PREJUIZO);
    expect(receita).toEqual({ lo: 0, hi: 8130, level: 8130 });
    expect(impostos).toEqual({ lo: 7805, hi: 8130, level: 7805 });
    expect(cmv).toEqual({ lo: 7805, hi: 7805, level: 7805 });
    expect(desp).toEqual({ lo: -13360, hi: 7805, level: -13360 });
    expect(resultado).toEqual({ lo: -13360, hi: 0, level: -13360 });
  });

  it('com lucro tudo fica acima do zero e o resultado nasce do zero', () => {
    const spans = waterfallSpans([
      { label: 'Receita', value: 1000, kind: 'start' },
      { label: 'Custos', value: -400, kind: 'down' },
      { label: 'Lucro', value: 600, kind: 'end' },
    ]);
    expect(spans.map((s) => s.lo)).toEqual([0, 600, 0]);
    expect(spans.map((s) => s.hi)).toEqual([1000, 1000, 600]);
  });
});

describe('WaterfallChartComponent', () => {
  beforeEach(() => {
    // O jsdom não tem ResizeObserver; o tamanho fica no padrão do componente (600 x 300).
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  function render(rows: WaterfallRow[]) {
    const fixture = TestBed.createComponent(WaterfallChartComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const bars = Array.from(root.querySelectorAll('svg rect')).map((r) => ({
      y: Number(r.getAttribute('y')),
      h: Number(r.getAttribute('height')),
      fill: r.getAttribute('fill'),
    }));
    const ticks = Array.from(root.querySelectorAll('svg text'))
      .map((t) => (t.textContent ?? '').trim())
      .filter((t) => /^-?[\d.,]+(k|mi)?$/.test(t));
    return { root, bars, ticks };
  }

  it('desenha o eixo com a faixa negativa e um zero no meio', () => {
    const { ticks } = render(PREJUIZO);
    expect(ticks).toContain('0');
    expect(ticks.some((t) => t.startsWith('-'))).toBe(true);
    expect(ticks.some((t) => !t.startsWith('-') && t !== '0')).toBe(true);
  });

  it('o prejuízo desce do zero até o fim e fica vermelho; a receita sobe do zero', () => {
    const { bars } = render(PREJUIZO);
    const [receita, , , despesas, resultado] = bars;
    // Base da receita = linha do zero; o resultado começa nela e desce.
    expect(receita.y + receita.h).toBeCloseTo(resultado.y, 5);
    expect(resultado.fill).toBe('var(--error)');
    // As despesas atravessam o zero: começam acima dele e terminam no mesmo ponto que o resultado.
    expect(despesas.y).toBeLessThan(resultado.y);
    expect(despesas.y + despesas.h).toBeCloseTo(resultado.y + resultado.h, 5);
  });

  it('lucro positivo continua verde', () => {
    const { bars } = render([
      { label: 'Receita', value: 1000, kind: 'start' },
      { label: 'Custos', value: -400, kind: 'down' },
      { label: 'Lucro', value: 600, kind: 'end' },
    ]);
    expect(bars[2].fill).toBe('var(--mint)');
  });

  it('sem nenhum valor mostra o aviso em vez do gráfico', () => {
    const { root } = render([{ label: 'Receita', value: 0, kind: 'start' }]);
    expect(root.querySelector('svg')).toBeNull();
    expect(root.textContent).toContain('Ainda sem dados');
  });
});
