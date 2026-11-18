import { analisar, impactoMes, recalcular, Prato } from './cardapio.builder';
import { PriceSensitivity, SalesProfile } from 'mintly-lib';
import {
  ELASTICIDADE,
  VendaComPreco,
  curvaLucro,
  elasticidadeMedida,
  elasticidadeDoPrato,
  precoOtimo,
  volumeNovo,
} from './cardapio-elasticidade';

// P.6: elasticidade-preço no simulador (relatório 12.7). Os números são os da fatia de cheesecake do relatório.

const cheesecake: Prato = {
  id: 'ch',
  name: 'Fatia de cheesecake',
  category: 'Doces',
  price: 22,
  cost: 7.8,
  soldPerMonth: 84,
  active: true,
  priceUpdatedAt: '2026-01-01T00:00:00.000Z',
  priceReviewedAt: '2026-01-01T00:00:00.000Z',
};
const lucro = (preco: number, e: number) => (preco - 7.8) * volumeNovo(84, 22, preco, e);

describe('volume e lucro com elasticidade (P.6)', () => {
  it('bate com a tabela do relatório', () => {
    expect(Math.round(volumeNovo(84, 22, 25, -1.2))).toBe(72);
    expect(Math.round(lucro(25, -1.2))).toBe(1239);
    expect(Math.round(volumeNovo(84, 22, 25, -1.8))).toBe(67);
    expect(Math.round(lucro(25, -1.8))).toBe(1148);
    expect(Math.round(lucro(25, -2.5))).toBe(1050);
    expect(Math.round(volumeNovo(84, 22, 19, -2.5))).toBe(121);
    expect(Math.round(lucro(32, -1.2))).toBe(1297);
  });

  it('as três sensibilidades são as faixas do relatório', () => {
    expect(ELASTICIDADE).toEqual({ pouca: -1.2, media: -1.8, muita: -2.5 });
  });

  it('preço de lucro máximo = custo × e ÷ (e + 1), só com e < −1', () => {
    expect(precoOtimo(7.8, -1.8)).toBe(17.55);
    expect(precoOtimo(7.8, -1)).toBeNull();
    expect(precoOtimo(7.8, -0.8)).toBeNull();
    expect(precoOtimo(0, -2)).toBeNull();
  });

  it('a curva marca a zona de risco (vendas caem mais de 30%)', () => {
    const c = curvaLucro(cheesecake, -1.8, { min: 19, max: 32, passo: 0.5 });
    expect(c[0]).toMatchObject({ preco: 19, risco: false });
    expect(c.find((p) => p.preco === 25)!.risco).toBe(false); // 67 un = −20%
    expect(c.find((p) => p.preco === 28)!.risco).toBe(true); // 54 un = −36%
    expect(c.at(-1)!.preco).toBe(32);
  });
});

describe('o simulador usa a elasticidade (P.6)', () => {
  it('recalcular muda o volume; sem elasticidade, nada muda (comportamento antigo)', () => {
    expect(recalcular(cheesecake, 25).qtd).toBe(84);
    expect(Math.round(recalcular(cheesecake, 25, -1.8).qtd)).toBe(67);
  });

  it('o impacto do mês conta a queda de volume: +R$ 252 viram −R$ 45 com −1,8', () => {
    const orig = recalcular(cheesecake, 22, -1.8);
    expect(Math.round(impactoMes(recalcular(cheesecake, 25), recalcular(cheesecake, 22)))).toBe(
      252,
    );
    expect(Math.round(impactoMes(recalcular(cheesecake, 25, -1.8), orig))).toBe(-45);
  });

  it('analisar aplica a elasticidade de cada prato', () => {
    const a = analisar([cheesecake], { ch: 28 }, { ch: -2.5 });
    expect(Math.round(a.itens[0].qtd)).toBe(46);
  });
});

describe('elasticidade medida pelo histórico (P.6)', () => {
  /** Vendas diárias do prato: `qtd` por dia ao preço `preco`. */
  const dias = (ini: string, n: number, qtd: number, preco: number): VendaComPreco[] =>
    Array.from({ length: n }, (_, i) => {
      const [y, m, d] = ini.split('-').map(Number);
      const dt = new Date(y, m - 1, d + i);
      const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      return {
        type: 'income',
        status: 'settled',
        date,
        items: [{ menuItemId: 'br', qty: qtd, unitPrice: preco }],
      };
    });

  it('compara 4 semanas antes e 4 depois do último reajuste', () => {
    // Brigadeiro R$ 5,50 → R$ 6,00 (+9,1%) em 01/10; vendia 10/dia, passou a 9/dia (−10%).
    const v = [...dias('2026-09-01', 30, 10, 5.5), ...dias('2026-10-01', 40, 9, 6)];
    const m = elasticidadeMedida(v, 'br', '2026-11-17');
    expect(m).toMatchObject({
      ok: true,
      data: '2026-10-01',
      de: 5.5,
      para: 6,
      antes: 280,
      depois: 252,
    });
    expect(m!.ok && m!.elasticidade).toBe(-1.1);
  });

  it('sem reajuste: null; reajuste recente: espera 4 semanas', () => {
    expect(elasticidadeMedida(dias('2026-09-01', 60, 10, 5.5), 'br', '2026-11-17')).toBeNull();
    const v = [...dias('2026-10-01', 40, 10, 5.5), ...dias('2026-11-10', 8, 9, 6)];
    expect(elasticidadeMedida(v, 'br', '2026-11-17')).toMatchObject({
      ok: false,
      data: '2026-11-10',
    });
  });

  it('vendas subindo junto com o preço não viram elasticidade', () => {
    const v = [...dias('2026-09-01', 30, 10, 5.5), ...dias('2026-10-01', 30, 12, 6)];
    const m = elasticidadeMedida(v, 'br', '2026-11-17');
    expect(m).toMatchObject({ ok: false });
    expect(m!.ok === false && m!.motivo).toContain('mesmo sentido');
  });

  it('ignora vendas canceladas e de outros pratos', () => {
    const v = [
      ...dias('2026-09-01', 30, 10, 5.5),
      ...dias('2026-10-01', 30, 9, 6),
      {
        type: 'income' as const,
        status: 'cancelled',
        date: '2026-10-05',
        items: [{ menuItemId: 'br', qty: 500, unitPrice: 6 }],
      },
      {
        type: 'income' as const,
        status: 'settled',
        date: '2026-10-06',
        items: [{ menuItemId: 'outro', qty: 500, unitPrice: 9 }],
      },
    ];
    const m = elasticidadeMedida(v, 'br', '2026-11-17');
    expect(m).toMatchObject({ ok: true, depois: 252 });
  });
});

describe('elasticidadeDoPrato: prato > medida > categoria > dia a dia', () => {
  const medidaOk = {
    ok: true as const,
    elasticidade: -1.1,
    data: '2026-10-01',
    de: 5.5,
    para: 6,
    antes: 280,
    depois: 252,
  };

  it('sem nada escolhido: perfil sugerido pelo nome da categoria', () => {
    const u = elasticidadeDoPrato({ category: 'Bebidas' }, null, []);
    expect(u).toMatchObject({
      origem: 'categoria',
      perfil: 'drink',
      perfilSugerido: true,
      valor: -1.2,
    });
    expect(elasticidadeDoPrato({ category: null }, null, [])).toMatchObject({
      perfil: 'everyday',
      valor: -1.5,
    });
  });

  it('o perfil salvo da categoria vale sobre o sugerido (sem diferenciar caixa)', () => {
    const u = elasticidadeDoPrato({ category: 'bebidas' }, null, [
      { category: 'Bebidas', profile: SalesProfile.Order },
    ]);
    expect(u).toMatchObject({
      origem: 'categoria',
      perfil: 'order',
      perfilSugerido: false,
      valor: -1,
    });
  });

  it('a medida no reajuste vale sobre a categoria; a escolha do prato vale sobre tudo', () => {
    expect(elasticidadeDoPrato({ category: 'Doces' }, medidaOk, [])).toMatchObject({
      origem: 'medida',
      valor: -1.1,
    });
    expect(
      elasticidadeDoPrato(
        { category: 'Doces', priceSensitivity: PriceSensitivity.High },
        medidaOk,
        [],
      ),
    ).toMatchObject({ origem: 'prato', valor: -2.5 });
  });
});
