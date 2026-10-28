import { ReceitaMov, buildReceitas, resolveWindow } from './receitas.builder';

const mov = (over: Partial<ReceitaMov>): ReceitaMov => ({
  date: '2026-10-10',
  gross: 100,
  net: 100,
  item: 'Venda de almoço',
  category: 'Venda Balcão',
  canal: 'salao',
  payment: 'PIX',
  ...over,
});

describe('resolveWindow', () => {
  it('Este mês: do dia 1 até hoje, contra o mesmo trecho do mês anterior', () => {
    const w = resolveWindow('Este mês', undefined, undefined, '2026-10-28');
    expect([w.start, w.end]).toEqual(['2026-10-01', '2026-10-28']);
    expect([w.prevStart, w.prevEnd]).toEqual(['2026-09-01', '2026-09-28']);
    expect(w.refLabel).toBe('Outubro/2026');
  });

  it('Este mês: limita o trecho anterior ao último dia do mês anterior', () => {
    const w = resolveWindow('Este mês', undefined, undefined, '2026-03-31');
    expect(w.prevEnd).toBe('2026-02-28');
  });

  it('Mês passado e 7 dias', () => {
    const m = resolveWindow('Mês passado', undefined, undefined, '2026-01-15');
    expect([m.start, m.end]).toEqual(['2025-12-01', '2025-12-31']);
    const s = resolveWindow('7 dias', undefined, undefined, '2026-10-28');
    expect([s.start, s.end, s.prevStart, s.prevEnd]).toEqual([
      '2026-10-22',
      '2026-10-28',
      '2026-10-15',
      '2026-10-21',
    ]);
  });

  it('Personalizado inválido cai em Este mês', () => {
    const w = resolveWindow('Personalizado', '2026-10-20', '2026-10-10', '2026-10-28');
    expect(w.key).toBe('este-mes');
  });
});

describe('buildReceitas', () => {
  const win = resolveWindow('Este mês', undefined, undefined, '2026-10-28');

  it('conta só o que está dentro do período e compara com o anterior', () => {
    const d = buildReceitas(
      [
        mov({ date: '2026-10-05', gross: 300, net: 300 }),
        mov({ date: '2026-10-20', gross: 100, net: 100 }),
        mov({ date: '2026-09-10', gross: 200, net: 200 }),
        mov({ date: '2026-08-10', gross: 999, net: 999 }),
      ],
      win,
      0,
    );
    expect(d.receitaBruta).toBe(400);
    expect(d.pedidos).toBe(2);
    expect(d.ticketMedio).toBe(200);
    expect(d.deltas.receitaBruta).toBe('+100,0%');
    expect(d.deltasUp.receitaBruta).toBe(true);
  });

  it('desconta taxas de plataforma e impostos da receita líquida', () => {
    const d = buildReceitas(
      [mov({ gross: 1000, net: 800, canal: 'delivery' }), mov({ gross: 1000, net: 1000 })],
      win,
      0.06,
    );
    expect(d.taxas).toBe(200);
    expect(d.impostos).toBe(120);
    expect(d.receitaLiquida).toBe(1680);
    expect(d.waterfall.map((r) => r.label)).toEqual([
      'Receita bruta',
      'Taxas',
      'Impostos s/ venda',
      'Receita líquida',
    ]);
    const [salao, delivery] = d.canais;
    expect(salao.receita).toBe(1000);
    expect(delivery.receita).toBe(1000);
    expect(delivery.liquida).toBe(740);
    expect(delivery.nota).toContain('20%');
  });

  it('sem período anterior para comparar mostra traço em vez de +0%', () => {
    const d = buildReceitas([mov({ date: '2026-10-05' })], win, 0);
    expect(d.deltas.receitaBruta).toBe('—');
    expect(d.deltas.pedidos).toBe('—');
  });

  it('sem lançamentos devolve zeros, sem NaN', () => {
    const d = buildReceitas([], win, 0);
    expect(d.receitaBruta).toBe(0);
    expect(d.ticketMedio).toBe(0);
    expect(d.deltas.receitaBruta).toBe('+0,0%');
    expect(d.canais.map((c) => c.receita)).toEqual([0, 0]);
    expect(d.tendencia).toHaveLength(6);
    expect(Number.isNaN(d.receitaLiquida)).toBe(false);
  });

  it('agrupa itens, categorias e formas de pagamento', () => {
    const d = buildReceitas(
      [
        mov({ item: 'Frango', category: 'Venda Balcão', gross: 300, payment: 'Débito' }),
        mov({ item: 'Frango', category: 'Venda Balcão', gross: 100, payment: 'Crédito' }),
        mov({
          item: 'Combo',
          category: 'Venda Delivery',
          gross: 150,
          payment: 'PIX',
          canal: 'delivery',
        }),
      ],
      win,
      0,
    );
    expect(d.itens[0]).toEqual({ nome: 'Frango', categoria: 'Venda Balcão', qtd: 2, receita: 400 });
    expect(d.porCategoria.map((c) => c.categoria)).toEqual(['Venda Balcão', 'Venda Delivery']);
    expect(d.formasPagamento).toEqual([
      { forma: 'Cartão', valor: 400 },
      { forma: 'Pix', valor: 150 },
    ]);
  });
});
