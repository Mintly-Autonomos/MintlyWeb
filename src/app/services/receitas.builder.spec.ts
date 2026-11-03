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

  it('igual ao período anterior é neutro: sem alta, sem queda', () => {
    const d = buildReceitas(
      [mov({ date: '2026-10-05', gross: 100 }), mov({ date: '2026-09-05', gross: 100 })],
      win,
      0,
    );
    expect(d.deltas.receitaBruta).toBe('0%');
    expect(d.deltasFlat.receitaBruta).toBe(true);
    expect(d.deltasUp.receitaBruta).toBe(false);
  });

  it('variação de verdade não é neutra', () => {
    const d = buildReceitas(
      [mov({ date: '2026-10-05', gross: 150 }), mov({ date: '2026-09-05', gross: 100 })],
      win,
      0,
    );
    expect(d.deltasFlat.receitaBruta).toBe(false);
    expect(d.deltasUp.receitaBruta).toBe(true);
  });

  it('sem lançamentos devolve zeros, sem NaN', () => {
    const d = buildReceitas([], win, 0);
    expect(d.receitaBruta).toBe(0);
    expect(d.ticketMedio).toBe(0);
    expect(d.deltas.receitaBruta).toBe('—');
    expect(d.canais.map((c) => c.receita)).toEqual([0, 0]);
    expect(d.tendencia).toHaveLength(6);
    expect(Number.isNaN(d.receitaLiquida)).toBe(false);
  });

  describe('ranking de pratos (itens mais vendidos)', () => {
    const pratos = (...p: [string, string, number, number][]) =>
      p.map(([menuItemId, name, qty, unitPrice]) => ({ menuItemId, name, qty, unitPrice }));

    it('cada prato vale o preço dele × a quantidade, sem dividir o total do pedido', () => {
      const d = buildReceitas(
        [
          mov({
            gross: 100,
            pratos: pratos(['arroz', 'Arroz', 2, 12.5], ['batata', 'Batata Rústica', 1, 18]),
          }),
          mov({ gross: 40, pratos: pratos(['arroz', 'Arroz', 1, 12.5]) }),
        ],
        win,
        0,
      );
      expect(d.itens.map((i) => [i.nome, i.qtd, i.receita])).toEqual([
        ['Arroz', 3, 37.5],
        ['Batata Rústica', 1, 18],
      ]);
      expect(d.semPratos).toBe(0);
    });

    it('ordena pela receita do prato, do maior para o menor', () => {
      const d = buildReceitas(
        [mov({ pratos: pratos(['a', 'Barato', 10, 5], ['b', 'Caro', 1, 90]) })],
        win,
        0,
      );
      expect(d.itens.map((i) => i.nome)).toEqual(['Caro', 'Barato']);
    });

    it('vendas sem pratos ficam fora do ranking e são contadas no aviso', () => {
      const d = buildReceitas(
        [
          mov({ item: 'Pedido 8547 Curry + Batata', gross: 150 }),
          mov({ gross: 30, pratos: pratos(['arroz', 'Arroz', 1, 12.5]) }),
        ],
        win,
        0,
      );
      expect(d.itens.map((i) => i.nome)).toEqual(['Arroz']);
      expect(d.semPratos).toBe(1);
      // mas continuam somando na receita total
      expect(d.receitaBruta).toBe(180);
    });
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
    // Sem pratos informados, o título do pedido NÃO vira "item": fica fora do ranking.
    expect(d.itens).toEqual([]);
    expect(d.semPratos).toBe(3);
    expect(d.porCategoria.map((c) => c.categoria)).toEqual(['Venda Balcão', 'Venda Delivery']);
    expect(d.formasPagamento).toEqual([
      { forma: 'Cartão', valor: 400 },
      { forma: 'Pix', valor: 150 },
    ]);
  });
});
