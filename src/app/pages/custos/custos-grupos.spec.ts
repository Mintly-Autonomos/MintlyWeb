import { DreGroup } from 'mintly-lib';
import { TestBed } from '@angular/core/testing';
import { StackedBarsComponent } from '../../shared/stacked-bars.component';
import { custosPorGrupo, grupoDe, percentuaisMensais } from './custos-grupos';

// P.9 (tabela 13.3): Custos por grupo, mês a mês, e CMV % / custo primário %.

const hist = (a: number, b: number) => [
  { month: '2026-09', amount: a },
  { month: '2026-10', amount: b },
];
const item = (kind: string, dreGroup: DreGroup | null, a: number, b: number) =>
  ({ kind, dreGroup, history: hist(a, b) }) as never;

describe('grupos de custo', () => {
  it('taxa de app e de maquininha vira Taxas; o resto vem do grupo do DRE', () => {
    expect(grupoDe({ kind: 'platformFee', dreGroup: null })).toBe('taxas');
    expect(grupoDe({ kind: 'cardFee', dreGroup: null })).toBe('taxas');
    expect(grupoDe({ kind: 'category', dreGroup: DreGroup.Cmv })).toBe('cmv');
    expect(grupoDe({ kind: 'category', dreGroup: DreGroup.Labor })).toBe('pessoal');
    expect(grupoDe({ kind: 'category', dreGroup: DreGroup.Tax })).toBe('impostos');
    expect(grupoDe({ kind: 'category', dreGroup: DreGroup.Opex })).toBe('outras');
  });

  it('soma cada grupo por mês e fecha com o total da API (o que falta vira "sem detalhe")', () => {
    const items = [
      item('category', DreGroup.Cmv, 100, 300),
      item('category', DreGroup.Labor, 0, 500),
      item('platformFee', null, 10, 20),
    ];
    const linhas = custosPorGrupo(items, [
      { month: '2026-09', total: 400 },
      { month: '2026-10', total: 820 },
    ]);
    expect(linhas[0]).toMatchObject({ cmv: 100, taxas: 10, semDetalhe: 290, total: 400 });
    expect(linhas[1]).toMatchObject({
      cmv: 300,
      pessoal: 500,
      taxas: 20,
      semDetalhe: 0,
      total: 820,
    });
  });

  it('% de CMV e de custo primário sobre a receita; mês sem venda ou sem detalhe fica de fora', () => {
    const linhas = custosPorGrupo(
      [item('category', DreGroup.Cmv, 100, 300), item('category', DreGroup.Labor, 0, 500)],
      [
        { month: '2026-09', total: 999 },
        { month: '2026-10', total: 800 },
      ],
    );
    const p = percentuaisMensais(
      linhas,
      new Map([
        ['2026-09', 1_000],
        ['2026-10', 2_000],
      ]),
    );
    expect(p).toEqual([{ mes: '2026-10', cmvPct: 15, primePct: 40 }]);
  });
});

describe('StackedBarsComponent', () => {
  it('uma coluna por mês com o total escrito; a coluna maior tem 100% da altura do eixo', () => {
    const fixture = TestBed.createComponent(StackedBarsComponent);
    fixture.componentRef.setInput('data', [
      { mes: 'Set', a: 100, b: 100 },
      { mes: 'Out', a: 300, b: 100 },
    ]);
    fixture.componentRef.setInput('series', [
      { key: 'a', name: 'A', color: 'red' },
      { key: 'b', name: 'B', color: 'blue' },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="total-1"]')!.textContent!.trim()).toBe('400');
    const colunas = el.querySelectorAll<HTMLElement>('[role="img"]');
    expect(colunas).toHaveLength(2);
    expect(parseFloat(colunas[1].style.height)).toBeGreaterThan(
      parseFloat(colunas[0].style.height),
    );
    expect(colunas[1].getAttribute('aria-label')).toContain('A 300, B 100 (total 400)');
  });
});
