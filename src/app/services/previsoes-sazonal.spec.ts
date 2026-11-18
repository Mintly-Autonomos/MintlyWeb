import {
  buildBase,
  PrevMov,
  ritmoVendasNoDia,
  custoVarNoDia,
  simular,
  AJUSTES_ZERO,
} from './previsoes.builder';
import { VendaHist, efeitoDiaDaSemana, preverVendas } from './previsoes-sazonal';

// P.5: previsão de vendas em três níveis conforme o histórico (relatório 12.6).

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Uma venda por dia, de `ini` até `fim`, com o valor que `valorDe` der para o dia. */
function diario(ini: string, fim: string, valorDe: (d: Date) => number): VendaHist[] {
  const out: VendaHist[] = [];
  const [y, m, dd] = ini.split('-').map(Number);
  for (let d = new Date(y, m - 1, dd); iso(d) <= fim; d.setDate(d.getDate() + 1)) {
    const v = valorDe(d);
    if (v) out.push({ data: iso(d), valor: v });
  }
  return out;
}

describe('efeitoDiaDaSemana (P.5)', () => {
  it('sábado que vende o dobro pesa o dobro; dia fechado pesa zero', () => {
    // Seg fechado (0), sáb 200, demais 100.
    const v = diario('2026-08-01', '2026-11-17', (d) =>
      d.getDay() === 1 ? 0 : d.getDay() === 6 ? 200 : 100,
    );
    const e = efeitoDiaDaSemana(v, '2026-11-17');
    expect(e[1]).toBe(0);
    expect(e[6] / e[2]).toBeCloseTo(2, 5);
    // A média dos 7 dias fica perto de 1.
    expect(e.reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 1);
  });

  it('sem vendas, todo dia pesa 1', () => {
    expect(efeitoDiaDaSemana([], '2026-11-17')).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('preverVendas (P.5)', () => {
  it('menos de 3 meses completos: ritmo dos últimos 30 dias em todo dia', () => {
    const v = diario('2026-09-10', '2026-11-17', () => 100);
    const p = preverVendas(v, '2026-11-17', 123);
    expect(p.nivel).toBe('ritmo');
    expect(p.mesesHistorico).toBe(2);
    expect(p.porDia).toHaveLength(90);
    expect(p.porDia.every((x) => x === 123)).toBe(true);
    expect(p.erroMedio).toBeNull();
  });

  it('3 a 11 meses: média de 90 dias × dia da semana, com erro testado nos meses fechados', () => {
    // Desde junho: 100 por dia, sábado 200.
    const v = diario('2026-06-01', '2026-11-17', (d) => (d.getDay() === 6 ? 200 : 100));
    const p = preverVendas(v, '2026-11-17', 999);
    expect(p.nivel).toBe('media');
    expect(p.mesesHistorico).toBe(5);
    // 2026-11-21 é sábado (índice 3 = 4 dias à frente) e 2026-11-18 é quarta.
    expect(p.porDia[3] / p.porDia[0]).toBeCloseTo(2, 5);
    expect(p.erroMedio).not.toBeNull();
    expect(p.erroMedio!).toBeLessThan(0.05);
    expect(p.meses[0].mes).toBe('Nov/26');
    expect(p.meses[0].anoAnterior).toBeNull();
  });

  it('12 meses ou mais: mesmo mês do ano anterior × crescimento dos últimos 6 contra os 6 anteriores', () => {
    // nov/24 a out/25: 1.000 por mês (dez/24: 3.000). nov/25 a abr/26: 1.000; mai/26 a out/26: 1.100 (cresceu 10%).
    // dez/25 = 3.000 de novo. Lança tudo no dia 10 de cada mês.
    const v: VendaHist[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(2024, 10 + i, 10);
      const ym = iso(d).slice(0, 7);
      let valor = 1000;
      if (ym === '2024-12' || ym === '2025-12') valor = 3000;
      if (ym >= '2026-05') valor = 1100;
      v.push({ data: iso(d), valor });
    }
    v.push({ data: '2026-11-10', valor: 500 }); // mês corrente, incompleto
    const p = preverVendas(v, '2026-11-17', 50);
    expect(p.nivel).toBe('sazonal');
    // últimos 6 (mai–out/26) = 1.100; 6 anteriores (nov/25–abr/26) = (1.000×5 + 3.000) ÷ 6 ≈ 1.333 → 0,825.
    expect(p.crescimento).toBe(0.83);
    const dez = p.meses.find((m) => m.mes === 'Dez/26')!;
    expect(dez.anoAnterior).toBe(3000);
    expect(dez.previsto).toBeCloseTo(3000 * (1100 / (8000 / 6)), 0);
    // A soma dos dias de dezembro bate com a previsão do mês.
    const ini = p.porDia.length - 90; // 0
    const dezDias = p.porDia.slice(ini + 13, ini + 13 + 31); // índice 0 = 18/11, então 01/12 = índice 13
    expect(dezDias.reduce((a, b) => a + b, 0)).toBeCloseTo(dez.previsto, 0);
    expect(p.erroMedio).not.toBeNull();
  });

  it('crescimento fora da curva fica limitado entre 0,5× e 2×', () => {
    const v: VendaHist[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(2024, 10 + i, 10);
      v.push({ data: iso(d), valor: iso(d) >= '2026-05' ? 10_000 : 100 });
    }
    expect(preverVendas(v, '2026-11-17', 0).crescimento).toBe(2);
  });
});

describe('buildBase usa a previsão (P.5)', () => {
  const mov = (over: Partial<PrevMov>): PrevMov => ({
    tipo: 'in',
    date: '2026-11-10',
    valor: 100,
    pendente: false,
    variavel: 0,
    aVista: true,
    lancamento: '2026-11-10',
    prazo: 0,
    naoOperacional: false,
    ...over,
  });

  it('o dinheiro do dia segue a venda prevista daquele dia; o custo variável acompanha', () => {
    // 6 meses de vendas: 100/dia, sábado 300. Custo variável à vista de 30/dia.
    const vendas = diario('2026-05-01', '2026-11-17', (d) => (d.getDay() === 6 ? 300 : 100)).map(
      (x) => mov({ date: x.data, lancamento: x.data, valor: x.valor }),
    );
    const custos = diario('2026-10-19', '2026-11-17', () => 30).map((x) =>
      mov({ tipo: 'out', date: x.data, lancamento: x.data, valor: x.valor, variavel: 1 }),
    );
    const base = buildBase([...vendas, ...custos], 0, 0, '2026-11-17');
    expect(base.previsao!.nivel).toBe('media');
    // k = 4 é sábado 21/11; k = 1 é quarta 18/11.
    expect(ritmoVendasNoDia(base, 4) / ritmoVendasNoDia(base, 1)).toBeCloseTo(3, 5);
    expect(custoVarNoDia(base, 4) / custoVarNoDia(base, 1)).toBeCloseTo(3, 5);
    // A receita do horizonte é a soma das vendas previstas.
    const soma30 = base.previsao!.porDia.slice(0, 30).reduce((a, b) => a + b, 0);
    expect(simular(AJUSTES_ZERO, 30, base).resultado.receita).toBeCloseTo(soma30, 0);
  });

  it('venda com repasse só vira dinheiro depois do prazo, na proporção dos últimos 30 dias', () => {
    const vendas = diario('2026-05-01', '2026-11-17', () => 100).flatMap((x) => [
      mov({ date: x.data, lancamento: x.data, valor: x.valor }),
      mov({ date: x.data, lancamento: x.data, valor: x.valor, prazo: 30, aVista: false }),
    ]);
    const base = buildBase(vendas, 0, 0, '2026-11-17');
    // Até o dia 30 só a metade à vista; a partir do 31 também a metade do cartão.
    expect(ritmoVendasNoDia(base, 10)).toBeCloseTo(base.previsao!.porDia[9] / 2, 5);
    expect(ritmoVendasNoDia(base, 40)).toBeCloseTo(
      base.previsao!.porDia[39] / 2 + base.previsao!.porDia[9] / 2,
      5,
    );
  });
});
