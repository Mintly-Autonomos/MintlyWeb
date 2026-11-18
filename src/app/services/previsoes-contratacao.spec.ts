import { horasNoMes, recomendarContratacao } from './previsoes-contratacao';

// P.4: recomendação de contratação pela sazonalidade (relatório 12.5).
// Sweetie Bel: 2 funcionárias + a dona, ~570 h/mês (≈ 131 h por semana); referência R$ 81/h.

const H = 131;
/** Histórico em que maio e outubro rodaram a R$ 81/h e os outros meses mais devagar. */
function historico(): Record<string, number> {
  const out: Record<string, number> = {};
  const meses = [
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
  ];
  for (const ym of meses) {
    const p = ym === '2026-05' || ym === '2026-10' ? 81 : 65;
    out[ym] = p * horasNoMes(H, ym);
  }
  return out;
}

describe('recomendarContratacao (P.4)', () => {
  it('a referência é a média dos 2 meses mais produtivos', () => {
    const r = recomendarContratacao({
      horasSemana: H,
      historico: historico(),
      previstos: [],
      margemContrib: 0.55,
      custoHora: 25,
    })!;
    expect(r.produtividadeRef).toBe(81);
    expect(r.mesesRef.sort()).toEqual(['Mai/26', 'Out/26']);
  });

  it('dezembro forte: faltam horas e a margem das vendas extras paga o reforço', () => {
    const r = recomendarContratacao({
      horasSemana: H,
      historico: historico(),
      previstos: [{ ym: '2026-12', mes: 'Dez/26', previsto: 53_000 }],
      margemContrib: 0.55,
      custoHora: 25,
    })!;
    const dez = r.meses[0];
    expect(dez.necessarias).toBeCloseTo(53_000 / 81, 0); // ~654 h
    expect(dez.disponiveis).toBeCloseTo((H * 31) / 7, 0); // ~580 h
    expect(dez.reforco).toBeGreaterThan(70);
    expect(dez.diarias).toBe(Math.ceil(dez.reforco / 8));
    expect(dez.vendasExtras).toBeCloseTo(dez.reforco * 81, -1);
    expect(dez.lucroExtra).toBeGreaterThan(dez.custoReforco);
    expect(dez.decisao).toBe('reforcar');
  });

  it('fevereiro fraco: sobra hora (segurar, férias ou banco de horas)', () => {
    const r = recomendarContratacao({
      horasSemana: H,
      historico: historico(),
      previstos: [{ ym: '2027-02', mes: 'Fev/27', previsto: 28_000 }],
      margemContrib: 0.55,
      custoHora: 25,
    })!;
    expect(r.meses[0].necessarias).toBeCloseTo(28_000 / 81, 0); // ~346 h
    expect(r.meses[0].decisao).toBe('folga');
    expect(r.meses[0].diarias).toBe(0);
  });

  it('falta gente mas a hora de reforço custa mais do que a margem traz: não compensa', () => {
    const r = recomendarContratacao({
      horasSemana: H,
      historico: historico(),
      previstos: [{ ym: '2026-12', mes: 'Dez/26', previsto: 53_000 }],
      margemContrib: 0.2,
      custoHora: 25,
    })!;
    expect(r.meses[0].decisao).toBe('nao-compensa'); // 81 × 20% = 16,20 por hora < 25
  });

  it('CLT só com índice acima de 1,15 por 3 meses seguidos', () => {
    const base = { horasSemana: H, historico: historico(), margemContrib: 0.55, custoHora: 25 };
    const media = Object.values(historico()).reduce((a, b) => a + b, 0) / 12;
    const um = recomendarContratacao({
      ...base,
      previstos: [
        { ym: '2026-12', mes: 'Dez/26', previsto: media * 1.3 },
        { ym: '2027-01', mes: 'Jan/27', previsto: media * 0.8 },
        { ym: '2027-02', mes: 'Fev/27', previsto: media * 1.3 },
      ],
    })!;
    expect(um.avaliarFixo).toBe(false);
    const tres = recomendarContratacao({
      ...base,
      previstos: [
        { ym: '2026-12', mes: 'Dez/26', previsto: media * 1.2 },
        { ym: '2027-01', mes: 'Jan/27', previsto: media * 1.2 },
        { ym: '2027-02', mes: 'Fev/27', previsto: media * 1.2 },
      ],
    })!;
    expect(tres.avaliarFixo).toBe(true);
  });

  it('sem equipe ou com menos de 3 meses fechados: null', () => {
    const p = [{ ym: '2026-12', mes: 'Dez/26', previsto: 1000 }];
    expect(
      recomendarContratacao({
        horasSemana: 0,
        historico: historico(),
        previstos: p,
        margemContrib: 0.5,
        custoHora: 25,
      }),
    ).toBeNull();
    expect(
      recomendarContratacao({
        horasSemana: 40,
        historico: { '2026-09': 1000, '2026-10': 1200 },
        previstos: p,
        margemContrib: 0.5,
        custoHora: 25,
      }),
    ).toBeNull();
  });
});
