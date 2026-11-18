import { ReceitaMov, buildReceitas, resolveWindow } from './receitas.builder';
import { sazonalidadePorCanal, temporadaDe } from './receitas-sazonalidade';

// P.2: sazonalidade por canal com índice sazonal (relatório 12.3).

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

/** Um lançamento por mês, de nov/25 a out/26, com os totais dados. */
const ano = (totais: number[]) =>
  totais.map((gross, i) => {
    const d = new Date(2025, 10 + i, 10);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
    return mov({ date: iso, gross });
  });

describe('temporadaDe (P.2)', () => {
  it('alta acima de 1,15, baixa abaixo de 0,85', () => {
    expect(temporadaDe(1.16)).toBe('alta');
    expect(temporadaDe(1.15)).toBe('normal');
    expect(temporadaDe(0.85)).toBe('normal');
    expect(temporadaDe(0.84)).toBe('baixa');
  });
});

describe('sazonalidadePorCanal (P.2)', () => {
  it('12 meses até o fim, por canal, com o índice contra a média dos 12', () => {
    const r = sazonalidadePorCanal(
      [
        ...ano([1000, 1300, 800, 750, 1000, 1000, 1200, 1000, 1000, 1000, 700, 1250]),
        mov({ date: '2026-10-20', gross: 0 }),
        mov({ date: '2025-12-15', gross: 0, canal: 'encomendas' }),
      ],
      '2026-10-31',
    );
    expect(r.meses).toHaveLength(12);
    expect(r.meses[0].mes).toBe('Nov/25');
    expect(r.meses[11].mes).toBe('Out/26');
    expect(r.mesesComHistorico).toBe(12);
    expect(r.mediaMensal).toBe(1000);
    expect(r.meses[1]).toMatchObject({ mes: 'Dez/25', indice: 1.3, temporada: 'alta' });
    expect(r.meses[3]).toMatchObject({ indice: 0.75, temporada: 'baixa' });
    expect(r.meses[0]).toMatchObject({ indice: 1, temporada: 'normal', parcial: false });
    expect(r.resumo).toContain('Alta temporada: Dez (1,30×)');
    expect(r.resumo).toContain('baixa: Jan (0,80×), Fev (0,75×), Set (0,70×)');
  });

  it('separa os canais e usa o dia da venda, não o do repasse', () => {
    const r = sazonalidadePorCanal(
      [
        mov({ date: '2026-11-02', saleDate: '2026-10-30', gross: 300, canal: 'delivery' }),
        mov({ date: '2026-10-05', gross: 200, canal: 'encomendas' }),
        mov({ date: '2026-10-06', gross: 50 }),
      ],
      '2026-10-31',
    );
    expect(r.meses[11]).toMatchObject({ salao: 50, delivery: 300, encomendas: 200, total: 550 });
  });

  it('a média começa no primeiro mês com venda; antes dele não há índice', () => {
    const r = sazonalidadePorCanal(
      [
        mov({ date: '2026-08-10', gross: 900 }),
        mov({ date: '2026-09-10', gross: 1200 }),
        mov({ date: '2026-10-10', gross: 900 }),
      ],
      '2026-10-31',
    );
    expect(r.mesesComHistorico).toBe(3);
    expect(r.mediaMensal).toBe(1000);
    expect(r.meses[10]).toMatchObject({ indice: 1.2, temporada: 'alta' });
    expect(r.meses[0].indice).toBeNull();
  });

  it('menos de 3 meses de histórico: sem índice e sem resumo', () => {
    const r = sazonalidadePorCanal(
      [mov({ date: '2026-09-10', gross: 500 }), mov({ date: '2026-10-10', gross: 800 })],
      '2026-10-31',
    );
    expect(r.meses.every((m) => m.indice === null)).toBe(true);
    expect(r.resumo).toBe('');
  });

  it('mês em andamento aparece, mas fica fora da média e sem índice', () => {
    const r = sazonalidadePorCanal(
      [
        ...ano([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]),
        mov({ date: '2026-11-05', gross: 200 }),
      ],
      '2026-11-17',
    );
    const nov = r.meses[11];
    expect(nov).toMatchObject({ mes: 'Nov/26', total: 200, parcial: true, indice: null });
    expect(r.mediaMensal).toBe(1000);
    expect(r.resumo).toContain('estáveis');
  });
});

describe('buildReceitas traz a sazonalidade (P.2)', () => {
  it('os 12 meses terminam no fim do período escolhido', () => {
    const win = resolveWindow('Mês passado', undefined, undefined, '2026-11-17'); // outubro/2026
    const d = buildReceitas(
      ano([1000, 1300, 800, 750, 1000, 1000, 1200, 1000, 1000, 1000, 700, 1250]),
      win,
      0,
    );
    expect(d.sazonalidade.meses[11].mes).toBe('Out/26');
    expect(d.sazonalidade.meses[11].parcial).toBe(false);
    expect(d.sazonalidade.meses[11].indice).toBe(1.25);
  });
});
