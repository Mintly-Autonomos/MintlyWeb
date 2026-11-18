import { feriadosEntre, feriadosNacionais, medirEfeitoFeriados, pascoa } from './feriados';
import { VendaHist, preverVendas } from './previsoes-sazonal';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Uma venda por dia de `ini` a `fim`, com o valor que `valorDe` der. */
function diario(ini: string, fim: string, valorDe: (iso: string) => number): VendaHist[] {
  const out: VendaHist[] = [];
  const [y, m, d] = ini.split('-').map(Number);
  for (let dt = new Date(y, m - 1, d); iso(dt) <= fim; dt.setDate(dt.getDate() + 1)) {
    const v = valorDe(iso(dt));
    if (v) out.push({ data: iso(dt), valor: v });
  }
  return out;
}

describe('feriados nacionais', () => {
  it('Páscoa pelo algoritmo de Meeus', () => {
    expect(pascoa(2024)).toBe('2024-03-31');
    expect(pascoa(2025)).toBe('2025-04-20');
    expect(pascoa(2026)).toBe('2026-04-05');
    expect(pascoa(2027)).toBe('2027-03-28');
  });

  it('2026: fixos + Carnaval, Sexta-feira Santa e Corpus Christi', () => {
    const f = feriadosNacionais(2026);
    const por = Object.fromEntries(f.map((x) => [x.data, x.nome]));
    expect(por['2026-02-16']).toBe('Carnaval');
    expect(por['2026-02-17']).toBe('Carnaval');
    expect(por['2026-04-03']).toBe('Sexta-feira Santa');
    expect(por['2026-06-04']).toBe('Corpus Christi');
    expect(por['2026-11-20']).toBe('Consciência Negra');
    expect(por['2026-12-25']).toBe('Natal');
    expect(f).toHaveLength(13);
  });

  it('Consciência Negra só a partir de 2024; o intervalo atravessa o ano', () => {
    expect(feriadosNacionais(2023).some((x) => x.nome === 'Consciência Negra')).toBe(false);
    expect(feriadosEntre('2026-12-20', '2027-01-05').map((x) => x.data)).toEqual([
      '2026-12-25',
      '2027-01-01',
    ]);
  });
});

describe('efeito medido no histórico', () => {
  it('loja que fecha no feriado mede 0; loja que enche mede acima de 1', () => {
    const fecha = new Map(
      diario('2025-06-01', '2026-11-17', (d) => (feriadosEntre(d, d).length ? 0 : 100)).map((v) => [
        v.data,
        v.valor,
      ]),
    );
    const e1 = medirEfeitoFeriados(fecha, '2026-11-18');
    expect(e1.porNome.get('Natal')).toBe(0);
    expect(e1.geral).toBe(0);

    const enche = new Map(
      diario('2025-06-01', '2026-11-17', (d) => (feriadosEntre(d, d).length ? 150 : 100)).map(
        (v) => [v.data, v.valor],
      ),
    );
    expect(medirEfeitoFeriados(enche, '2026-11-18').porNome.get('Finados')).toBe(1.5);
  });

  it('sem histórico antes do feriado não mede nada', () => {
    const curto = new Map(
      diario('2026-11-10', '2026-11-17', () => 100).map((v) => [v.data, v.valor]),
    );
    expect(medirEfeitoFeriados(curto, '2026-11-18').geral).toBeNull();
  });
});

describe('a previsão usa o efeito dos feriados', () => {
  it('nível "média": o Natal de quem fecha prevê ~0 e aparece na lista', () => {
    const v = diario('2026-06-01', '2026-11-17', (d) => (feriadosEntre(d, d).length ? 0 : 100));
    const p = preverVendas(v, '2026-11-18', 100);
    expect(p.nivel).toBe('media');
    const natal = p.feriados.find((f) => f.nome === 'Natal')!;
    expect(natal).toMatchObject({ data: '2026-12-25', medido: true });
    // Natal não tem medida própria (o histórico começa em junho): usa a média dos feriados medidos (0).
    expect(natal.fator).toBe(0);
    expect(p.porDia[36]).toBe(0); // 18/11 + 37 dias = 25/12 (índice 36)
    expect(p.porDia[35]).toBeGreaterThan(0);
  });

  it('nível "sazonal": o feriado redistribui, mas o total do mês continua o do ano anterior × crescimento', () => {
    const v = diario('2024-11-01', '2026-10-31', (d) => (feriadosEntre(d, d).length ? 0 : 100));
    const p = preverVendas(v, '2026-11-18', 100, 90);
    expect(p.nivel).toBe('sazonal');
    const dez = p.meses.find((m) => m.mes === 'Dez/26')!;
    // 01/12 = índice 12 (18/11 + 13 dias)
    const soma = p.porDia.slice(12, 12 + 31).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(dez.previsto, 0);
    expect(p.porDia[36]).toBe(0);
  });

  it('pouco histórico: lista os feriados, sem efeito', () => {
    const p = preverVendas(
      diario('2026-10-01', '2026-11-17', () => 100),
      '2026-11-18',
      100,
    );
    expect(p.nivel).toBe('ritmo');
    expect(p.feriados.find((f) => f.nome === 'Natal')).toMatchObject({ fator: 1, medido: false });
  });
});
