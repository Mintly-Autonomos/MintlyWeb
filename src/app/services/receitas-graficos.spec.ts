import { ReceitaMov, buildReceitas, resolveWindow } from './receitas.builder';

// P.9 do relatório Sweetie Bel (tabela 13.3): gráficos de Receitas.

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
const prato = (menuItemId: string, name: string, qty: number, unitPrice: number) => ({
  menuItemId,
  name,
  qty,
  unitPrice,
});

describe('Itens mais vendidos: lucro por prato', () => {
  it('lucro = (preço − custo atual) × quantidade; prato sem custo fica sem lucro', () => {
    const d = buildReceitas(
      [
        mov({ gross: 60, pratos: [prato('bolo', 'Bolo', 2, 20), prato('cafe', 'Café', 4, 5)] }),
        mov({ gross: 40, pratos: [prato('bolo', 'Bolo', 2, 20)] }),
      ],
      win,
      0,
      new Map([
        ['bolo', 8],
        ['cafe', 0],
      ]),
    );
    const bolo = d.itens.find((i) => i.nome === 'Bolo')!;
    expect(bolo).toMatchObject({ qtd: 4, receita: 80, lucro: 48 });
    expect(d.itens.find((i) => i.nome === 'Café')!.lucro).toBeNull();
  });

  it('sem custos informados, nenhum prato tem lucro', () => {
    const d = buildReceitas([mov({ pratos: [prato('bolo', 'Bolo', 1, 20)] })], win, 0);
    expect(d.itens[0].lucro).toBeNull();
  });
});

describe('Formas de pagamento: volume e quanto custa', () => {
  it('débito e crédito separados, cada um com a taxa que a conta cobrou', () => {
    const d = buildReceitas(
      [
        mov({ payment: 'PIX', gross: 500, net: 500 }),
        mov({ payment: 'Crédito', gross: 1_000, net: 968.5 }),
        mov({ payment: 'Débito', gross: 300, net: 295.89 }),
      ],
      win,
      0,
    );
    expect(d.formasPagamento.map((f) => [f.rotulo, f.valor])).toEqual([
      ['Crédito · 3,2%', 1_000],
      ['Pix · 0%', 500],
      ['Débito · 1,4%', 300],
    ]);
  });
});

describe('Tendência: 12 meses, ano anterior e média de 3 meses', () => {
  it('cada mês traz o mesmo mês do ano anterior e a média dos últimos 3', () => {
    const d = buildReceitas(
      [
        mov({ date: '2026-10-05', gross: 900 }),
        mov({ date: '2026-09-05', gross: 600 }),
        mov({ date: '2026-08-05', gross: 300 }),
        mov({ date: '2025-10-05', gross: 700 }),
      ],
      win,
      0,
    );
    expect(d.tendencia).toHaveLength(12);
    expect(d.tendencia.map((t) => t.mes)[0]).toBe('Nov');
    const outubro = d.tendencia.at(-1)!;
    expect(outubro).toMatchObject({ mes: 'Out', total: 900, anoAnterior: 700, media3: 600 });
    expect(d.tendenciaDescricao).toContain('12 meses');
  });

  it('em período curto (dia a dia) não tem ano anterior nem média', () => {
    const w = resolveWindow('7 dias', undefined, undefined, '2026-10-28');
    const d = buildReceitas([mov({ date: '2026-10-27', gross: 100 })], w, 0);
    expect(d.tendencia[0].anoAnterior).toBeUndefined();
    expect(d.tendencia[0].media3).toBeUndefined();
  });
});
