import { ReceitaMov, buildReceitas, resolveWindow } from './receitas.builder';
import { porDiaDaSemana, porDiaDoMes, porHora, porMesDoAno } from './receitas-quando';

// P.7: "Quando você mais vende" por Dia / Semana / Mês / Ano.

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

describe('porHora (P.7)', () => {
  it('soma por hora entre a primeira e a última hora com venda e conta as vendas sem hora', () => {
    const r = porHora([
      mov({ saleTime: '11:40', gross: 50 }),
      mov({ saleTime: '11:05', gross: 30 }),
      mov({ saleTime: '14:10', gross: 70 }),
      mov({ gross: 999, salesCount: 12 }),
    ]);
    expect(r.pontos.map((p) => p.hora)).toEqual(['11h', '12h', '13h', '14h']);
    expect(r.pontos[0].valor).toBe(80);
    expect(r.pontos[1].valor).toBe(0);
    expect(r.pontos[3].valor).toBe(70);
    expect(r.semHora).toBe(12);
  });

  it('sem nenhuma hora, não há pontos', () => {
    expect(porHora([mov({}), mov({})])).toEqual({ pontos: [], semHora: 2 });
  });
});

describe('porDiaDaSemana (P.7)', () => {
  it('usa o dia da venda e calcula o índice contra a média dos 7 dias', () => {
    // 10/10/2026 é sábado; 05/10/2026 é segunda.
    const r = porDiaDaSemana([
      mov({ date: '2026-10-12', saleDate: '2026-10-10', gross: 400 }),
      mov({ date: '2026-10-05', gross: 300 }),
    ]);
    expect(r.map((d) => d.dia)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    expect(r[5].valor).toBe(400);
    expect(r[0].valor).toBe(300);
    expect(r[5].indice).toBe(4); // média = 700 / 7 = 100
    expect(r[1].indice).toBe(0);
  });

  it('sem vendas, índice zero (sem dividir por zero)', () => {
    expect(porDiaDaSemana([]).every((d) => d.valor === 0 && d.indice === 0)).toBe(true);
  });
});

describe('porDiaDoMes (P.7)', () => {
  it('soma os meses do período por dia e vai pelo menos até o dia 28', () => {
    const r = porDiaDoMes([
      mov({ date: '2026-10-05', gross: 100 }),
      mov({ date: '2026-09-05', gross: 50 }),
      mov({ date: '2026-10-20', gross: 10 }),
    ]);
    expect(r).toHaveLength(28);
    expect(r[4]).toEqual({ dia: '5', valor: 150 });
    expect(r[19].valor).toBe(10);
  });

  it('vai até o dia 31 quando há venda nele', () => {
    expect(porDiaDoMes([mov({ date: '2026-10-31' })])).toHaveLength(31);
  });
});

describe('porMesDoAno (P.7)', () => {
  it('12 meses até o fim do período, com o mesmo mês do ano anterior', () => {
    const r = porMesDoAno(
      [
        mov({ date: '2026-10-10', gross: 500 }),
        mov({ date: '2025-10-03', gross: 200 }),
        mov({ date: '2025-11-20', gross: 80 }),
      ],
      '2026-10-31',
    );
    expect(r).toHaveLength(12);
    expect(r[0].mes).toBe('Nov/25');
    expect(r[0]).toEqual({ mes: 'Nov/25', valor: 80, anoAnterior: 0 });
    expect(r[11]).toEqual({ mes: 'Out/26', valor: 500, anoAnterior: 200 });
  });
});

describe('buildReceitas monta o "quando" (P.7)', () => {
  it('dia/semana/mês olham o período; ano olha os 12 meses até o fim', () => {
    const win = resolveWindow('Mês passado', undefined, undefined, '2026-11-17'); // outubro/2026
    const d = buildReceitas(
      [
        mov({ date: '2026-10-10', gross: 400, saleTime: '19:30' }),
        mov({ date: '2026-05-10', gross: 250 }), // fora do período
      ],
      win,
      0,
    );
    expect(d.quando.hora.pontos).toEqual([{ hora: '19h', valor: 400 }]);
    expect(d.quando.semana.reduce((a, s) => a + s.valor, 0)).toBe(400);
    expect(d.quando.mes[9].valor).toBe(400);
    expect(d.quando.ano.find((m) => m.mes === 'Mai/26')!.valor).toBe(250);
  });
});
