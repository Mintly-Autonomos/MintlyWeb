import { TestBed } from '@angular/core/testing';
import { BarChartComponent } from './bar-chart.component';

const PEDIDO = 'Curry + Batata Rústica; Soyu e alho + Batata Rústica; Refrigerante 350ml';
const serie = [{ key: 'v', name: 'Receita', color: 'blue' }];

describe('BarChartComponent', () => {
  beforeEach(() => {
    // O jsdom não tem ResizeObserver; o tamanho fica no padrão do componente (600 x 300).
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(BarChartComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    /** Só o que se enxerga: o <title> (tooltip nativo do SVG) entra no textContent e não conta. */
    const visible = (t: Element) =>
      Array.from(t.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    const texts = () => Array.from(root.querySelectorAll('svg text')).map(visible);
    const rects = () =>
      Array.from(root.querySelectorAll('svg rect')).map((r) => ({
        x: Number(r.getAttribute('x')),
        y: Number(r.getAttribute('y')),
        w: Number(r.getAttribute('width')),
        h: Number(r.getAttribute('height')),
      }));
    return { fixture, root, texts, rects, visible };
  }

  describe('barras horizontais (ex.: itens mais vendidos)', () => {
    const data = [
      { nome: PEDIDO, v: 1200 },
      { nome: 'Batata', v: 400 },
      { nome: 'Arroz', v: 30 },
    ];
    const inputs = {
      data,
      categoryKey: 'nome',
      series: serie,
      orientation: 'bars',
      categoryLabelWidth: 170,
      valueFormatter: (v: number) => `R$ ${v}`,
    };

    it('nome de pedido gigante é cortado com reticências (o inteiro fica no title)', () => {
      const { root, texts } = render(inputs);
      const cortado = texts().find((t) => t.includes('Curry'));
      expect(cortado).toBeDefined();
      expect(cortado!.endsWith('…')).toBe(true);
      expect(cortado!.length).toBeLessThan(PEDIDO.length);
      expect(Array.from(root.querySelectorAll('svg title')).map((t) => t.textContent)).toContain(
        PEDIDO,
      );
      expect(texts()).toContain('Batata');
    });

    it('cada barra mostra o seu valor escrito (não só ao passar o mouse)', () => {
      const { texts } = render(inputs);
      expect(texts()).toEqual(expect.arrayContaining(['R$ 1200', 'R$ 400', 'R$ 30']));
    });

    it('o eixo de baixo mostra os valores', () => {
      const { texts } = render(inputs);
      expect(texts()).toContain('R$ 0');
      expect(texts().some((t) => /^R\$ 1[0-9]{3}$/.test(t) && t !== 'R$ 1200')).toBe(true);
    });

    it('a maior barra não passa da área do gráfico, e a menor ainda é visível', () => {
      const { rects } = render(inputs);
      const [maior, , menor] = rects();
      expect(maior.x + maior.w).toBeLessThanOrEqual(600);
      expect(menor.w).toBeGreaterThanOrEqual(2);
      expect(maior.w).toBeGreaterThan(menor.w);
    });

    it('o número da maior barra não sai do gráfico: vai por dentro quando não cabe fora', () => {
      const { root, visible } = render({
        ...inputs,
        data: [
          { nome: 'A', v: 1000 },
          { nome: 'B', v: 10 },
        ],
      });
      // Os números das barras são os de negrito (os do eixo ficam centralizados, em fonte normal).
      const labels = Array.from(root.querySelectorAll('svg text[font-weight="600"]'));
      const grande = labels.find((t) => visible(t) === 'R$ 1000')!;
      expect(grande.getAttribute('text-anchor')).toBe('end');
      expect(grande.getAttribute('fill')).toBe('#fff');
      const pequeno = labels.find((t) => visible(t) === 'R$ 10')!;
      expect(pequeno.getAttribute('text-anchor')).toBe('start');
    });

    it('o tooltip pode mostrar o valor exato enquanto o eixo e a barra ficam curtos', () => {
      const { fixture } = render({
        ...inputs,
        valueFormatter: (v: number) => `${v / 1000}k`,
        tooltipFormatter: (v: number) => `R$ ${v},00`,
      });
      const fmt = (fixture.componentInstance as unknown as { fmt(v: number): string }).fmt;
      expect(fmt.call(fixture.componentInstance, 1200)).toBe('R$ 1200,00');
    });

    it('um valor enorme perto de valores pequenos continua mostrando todos os números', () => {
      const { texts } = render({
        ...inputs,
        data: [
          { nome: 'Combo', v: 98_000 },
          { nome: 'Molho', v: 12 },
        ],
      });
      expect(texts()).toEqual(expect.arrayContaining(['R$ 98000', 'R$ 12']));
    });
  });

  describe('colunas', () => {
    it('valor negativo desce a partir do zero (antes saía fora do gráfico)', () => {
      const { rects } = render({
        data: [
          { m: 'Set', v: 100 },
          { m: 'Out', v: -60 },
        ],
        categoryKey: 'm',
        series: serie,
        orientation: 'columns',
      });
      const [pos, neg] = rects();
      expect(pos.h).toBeGreaterThan(0);
      expect(neg.h).toBeGreaterThan(0);
      // a positiva termina no zero; a negativa começa nele
      expect(pos.y + pos.h).toBeCloseTo(neg.y, 5);
      expect(neg.y + neg.h).toBeLessThanOrEqual(300);
    });

    it('sem negativos não desenha a linha do zero; com negativos desenha', () => {
      const so = render({ data: [{ m: 'A', v: 5 }], categoryKey: 'm', series: serie });
      const com = render({
        data: [
          { m: 'A', v: 5 },
          { m: 'B', v: -5 },
        ],
        categoryKey: 'm',
        series: serie,
      });
      const zero = (r: ReturnType<typeof render>) =>
        r.root.querySelectorAll('svg line[stroke="var(--muted-foreground)"]').length;
      expect(zero(so)).toBe(0);
      expect(zero(com)).toBe(1);
    });

    it('nomes de coluna longos são cortados para não se sobrepor', () => {
      const { texts } = render({
        data: Array.from({ length: 12 }, (_, i) => ({
          m: `Categoria muito comprida ${i}`,
          v: i + 1,
        })),
        categoryKey: 'm',
        series: serie,
      });
      expect(texts().some((t) => t.endsWith('…'))).toBe(true);
    });
  });

  it('tela estreita não inverte as barras (largura nunca negativa)', () => {
    const fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('data', [{ n: 'Batata', v: 50 }]);
    fixture.componentRef.setInput('categoryKey', 'n');
    fixture.componentRef.setInput('series', serie);
    fixture.componentRef.setInput('orientation', 'bars');
    fixture.componentRef.setInput('categoryLabelWidth', 170);
    (fixture.componentInstance as unknown as { size: { set(v: object): void } }).size.set({
      w: 150,
      h: 200,
    });
    fixture.detectChanges();
    const widths = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('svg rect'),
    ).map((r) => Number(r.getAttribute('width')));
    expect(widths.every((w) => w >= 0)).toBe(true);
  });
});
