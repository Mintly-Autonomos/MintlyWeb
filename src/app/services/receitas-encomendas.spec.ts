import { ReceitaMov, buildReceitas, faixaDaHora, resolveWindow } from './receitas.builder';

// S3.4: canal Encomendas, ticket médio pelo número de vendas e mapa "Quando você mais vende" pela hora.

const mov = (over: Partial<ReceitaMov>): ReceitaMov => ({
  date: '2026-10-10',
  gross: 100,
  net: 100,
  item: 'Venda',
  category: 'Vendas',
  canal: 'salao',
  payment: 'PIX',
  ...over,
});
const win = resolveWindow('Mês passado', undefined, undefined, '2026-11-17'); // outubro/2026

describe('ticket médio e vendas (S3.4)', () => {
  it('o fechamento do dia conta as vendas que soma; sem número, cada lançamento é uma venda', () => {
    const d = buildReceitas(
      [mov({ gross: 1_500, salesCount: 42 }), mov({ gross: 180 }), mov({ gross: 120 })],
      win,
      0,
    );
    expect(d.pedidos).toBe(44);
    expect(d.ticketMedio).toBe(Math.round((1_800 / 44) * 100) / 100);
    expect(d.pedidosLabel).toBe('Vendas no mês');
  });

  it('a variação do ticket compara com o período anterior pelo mesmo critério', () => {
    const d = buildReceitas(
      [
        mov({ date: '2026-10-05', gross: 1_000, salesCount: 20 }), // ticket 50
        mov({ date: '2026-09-05', gross: 800, salesCount: 20 }), // ticket 40
      ],
      win,
      0,
    );
    expect(d.ticketMedio).toBe(50);
    expect(d.deltas.ticketMedio).toBe('+25,0%');
    expect(d.deltas.pedidos).toBe('0%');
  });
});

describe('canal Encomendas (S3.4)', () => {
  it('aparece como terceiro canal e na tendência, separado do salão e do delivery', () => {
    const d = buildReceitas(
      [
        mov({ gross: 400 }),
        mov({ gross: 300, net: 255, canal: 'delivery' }),
        mov({ gross: 600, canal: 'encomendas' }),
      ],
      win,
      0,
    );
    expect(d.temEncomendas).toBe(true);
    expect(d.canais.map((c) => [c.canal, c.receita])).toEqual([
      ['Salão', 400],
      ['Delivery', 300],
      ['Encomendas', 600],
    ]);
    const outubro = d.tendencia.find((t) => t.mes === 'Out')!;
    expect(outubro).toMatchObject({ total: 1_300, salao: 400, delivery: 300, encomendas: 600 });
  });

  it('quem nunca lançou encomenda continua vendo só Salão e Delivery', () => {
    const d = buildReceitas([mov({ gross: 400 }), mov({ gross: 300, canal: 'delivery' })], win, 0);
    expect(d.temEncomendas).toBe(false);
    expect(d.canais.map((c) => c.canal)).toEqual(['Salão', 'Delivery']);
  });

  it('encomenda de outro período ainda mostra o canal (zerado) neste', () => {
    const d = buildReceitas(
      [mov({ gross: 400 }), mov({ date: '2026-08-10', gross: 900, canal: 'encomendas' })],
      win,
      0,
    );
    expect(d.canais.find((c) => c.canal === 'Encomendas')).toMatchObject({ receita: 0 });
  });
});

describe('Quando você mais vende (S3.4)', () => {
  it('faixas do dia pela hora', () => {
    expect(
      ['07:30', '10:59', '11:00', '14:59', '15:00', '17:59', '18:00', '23:10'].map(faixaDaHora),
    ).toEqual(['Manhã', 'Manhã', 'Almoço', 'Almoço', 'Tarde', 'Tarde', 'Noite', 'Noite']);
  });

  it('soma por dia da semana DA VENDA e faixa; vendas sem hora ficam fora e a tela diz quantas entraram', () => {
    const d = buildReceitas(
      [
        // sábado 10/10, o dinheiro entrou na segunda 12/10 (repasse): o dia é o da venda.
        mov({ date: '2026-10-12', saleDate: '2026-10-10', saleTime: '15:30', gross: 200 }),
        mov({ date: '2026-10-10', saleDate: '2026-10-10', saleTime: '16:00', gross: 50 }),
        mov({ date: '2026-10-13', saleDate: '2026-10-13', saleTime: '12:10', gross: 80 }), // terça
        mov({ date: '2026-10-14', gross: 1_000, salesCount: 30 }), // fechamento sem hora
      ],
      win,
      0,
    );
    expect(d.heatmap).not.toBeNull();
    expect(d.heatmap!.length).toBe(28);
    expect(d.heatmap!.find((h) => h.dia === 'Sáb' && h.faixa === 'Tarde')!.valor).toBe(250);
    expect(d.heatmap!.find((h) => h.dia === 'Ter' && h.faixa === 'Almoço')!.valor).toBe(80);
    expect(d.heatmap!.find((h) => h.dia === 'Seg' && h.faixa === 'Tarde')!.valor).toBe(0);
    expect(d.heatmapMax).toBe(250);
    expect(d.heatmapCobertura).toBe('3 de 33 vendas do período têm hora informada.');
  });

  it('sem nenhuma venda com hora, o mapa fica vazio e explica como preencher', () => {
    const d = buildReceitas([mov({ gross: 100 })], win, 0);
    expect(d.heatmap).toBeNull();
    expect(d.heatmapVazioMsg).toContain('Hora da venda');
  });

  it('com todas as vendas com hora, não mostra a linha de cobertura', () => {
    const d = buildReceitas([mov({ saleDate: '2026-10-10', saleTime: '09:00' })], win, 0);
    expect(d.heatmapCobertura).toBeUndefined();
  });
});
