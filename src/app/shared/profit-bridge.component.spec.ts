import { TestBed } from '@angular/core/testing';
import { ProfitBridgeComponent, bridgeRows } from './profit-bridge.component';
import type { WaterfallRow } from './waterfall-chart.component';

// "Como seu lucro se forma" (pedido do Nathan, 18/11): ponte horizontal no lugar da cascata vertical.

const lucro: WaterfallRow[] = [
  { label: 'Vendas', value: 10_000, kind: 'start' },
  { label: 'CMV', value: -3_000, kind: 'down' },
  { label: 'Despesas', value: -4_000, kind: 'down' },
  { label: 'Resultado', value: 3_000, kind: 'end' },
];
const prejuizo: WaterfallRow[] = [
  { label: 'Vendas', value: 8_000, kind: 'start' },
  { label: 'CMV', value: -2_600, kind: 'down' },
  { label: 'Mão de obra', value: -13_000, kind: 'down' },
  { label: 'Resultado', value: -7_600, kind: 'end' },
  { label: 'Empréstimo', value: 10_000, kind: 'up' },
  { label: 'Depois do não operacional', value: 2_400, kind: 'end' },
];

describe('bridgeRows', () => {
  it('cada etapa começa onde a anterior terminou; o resultado vai do zero até ele', () => {
    expect(bridgeRows(lucro).map((r) => [r.lo, r.hi, r.level])).toEqual([
      [0, 10_000, 10_000],
      [7_000, 10_000, 7_000],
      [3_000, 7_000, 3_000],
      [0, 3_000, 3_000],
    ]);
    expect(bridgeRows(lucro).map((r) => r.pct)).toEqual([100, 30, 40, 30]);
  });

  it('prejuízo fica à esquerda do zero, e o não operacional continua a partir dele', () => {
    const r = bridgeRows(prejuizo);
    expect(r[2]).toMatchObject({ lo: -7_600, hi: 5_400, level: -7_600 });
    expect(r[3]).toMatchObject({ lo: -7_600, hi: 0 });
    expect(r[4]).toMatchObject({ lo: -7_600, hi: 2_400, level: 2_400 });
    expect(r[5]).toMatchObject({ lo: 0, hi: 2_400 });
  });

  it('sem vendas o % fica vazio (sem dividir por zero)', () => {
    expect(bridgeRows([{ label: 'Resultado', value: -500, kind: 'end' }])[0].pct).toBeNull();
  });
});

describe('ProfitBridgeComponent', () => {
  function montar(rows: WaterfallRow[]) {
    const fixture = TestBed.createComponent(ProfitBridgeComponent);
    fixture.componentRef.setInput('data', rows);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('uma linha por etapa, com o valor e o % das vendas; dedução com sinal de menos', () => {
    const el = montar(lucro);
    const linhas = [...el.querySelectorAll('li')].map((l) =>
      l.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(linhas).toHaveLength(4);
    expect(linhas[1]).toMatch(/CMV − R\$\s?3\.000,00 30%/);
    expect(linhas[3]).toMatch(/Resultado R\$\s?3\.000,00 30%/);
    expect(el.textContent).not.toContain('prejuízo');
  });

  it('prejuízo aparece escrito, em vermelho, e a barra fica à esquerda do zero', () => {
    const el = montar(prejuizo.slice(0, 4));
    const ultima = el.querySelector('[data-testid="ponte-3"]')!;
    expect(ultima.textContent).toContain('prejuízo');
    expect(ultima.querySelector('.text-error')).not.toBeNull();
    const barras = ultima.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span');
    const zero = parseFloat(barras[0].style.left);
    const barra = barras[1];
    expect(parseFloat(barra.style.left) + parseFloat(barra.style.width)).toBeCloseTo(zero, 5);
  });

  it('tudo zerado mostra o aviso em vez de barras', () => {
    const el = montar([
      { label: 'Vendas', value: 0, kind: 'start' },
      { label: 'Resultado', value: 0, kind: 'end' },
    ]);
    expect(el.querySelector('li')).toBeNull();
    expect(el.textContent).toContain('Sem lançamentos');
  });
});
