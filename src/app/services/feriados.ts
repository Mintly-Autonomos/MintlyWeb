/**
 * Feriados nacionais calculados no próprio app (decisão do Nathan: sem depender de API externa). Puro.
 *
 * Fixos: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11 (Consciência Negra, nacional desde 2024) e 25/12.
 * Móveis, pela Páscoa (algoritmo de Meeus/Jones/Butcher): Carnaval (segunda e terça), Sexta-feira Santa e Corpus
 * Christi. Carnaval e Corpus Christi são ponto facultativo, mas mudam o movimento do comércio, por isso entram.
 * Feriados estaduais e municipais não entram.
 *
 * O efeito de cada feriado nas vendas é MEDIDO no histórico: venda do dia do feriado ÷ venda média do mesmo dia da
 * semana nas 4 semanas antes e nas 4 depois (sem outros feriados). Loja que fecha no feriado mede perto de 0;
 * loja de bairro que enche no feriado mede acima de 1.
 */

export interface Feriado {
  /** "AAAA-MM-DD" */
  data: string;
  nome: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
};

/** Domingo de Páscoa do ano (calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

export function feriadosNacionais(ano: number): Feriado[] {
  const p = pascoa(ano);
  const fixos: Feriado[] = [
    { data: `${ano}-01-01`, nome: 'Confraternização Universal' },
    { data: `${ano}-04-21`, nome: 'Tiradentes' },
    { data: `${ano}-05-01`, nome: 'Dia do Trabalho' },
    { data: `${ano}-09-07`, nome: 'Independência' },
    { data: `${ano}-10-12`, nome: 'Nossa Senhora Aparecida' },
    { data: `${ano}-11-02`, nome: 'Finados' },
    { data: `${ano}-11-15`, nome: 'Proclamação da República' },
    ...(ano >= 2024 ? [{ data: `${ano}-11-20`, nome: 'Consciência Negra' }] : []),
    { data: `${ano}-12-25`, nome: 'Natal' },
  ];
  const moveis: Feriado[] = [
    { data: addDays(p, -48), nome: 'Carnaval' },
    { data: addDays(p, -47), nome: 'Carnaval' },
    { data: addDays(p, -2), nome: 'Sexta-feira Santa' },
    { data: addDays(p, 60), nome: 'Corpus Christi' },
  ];
  return [...fixos, ...moveis].sort((x, y) => x.data.localeCompare(y.data));
}

/** Feriados entre duas datas (inclusive). */
export function feriadosEntre(ini: string, fim: string): Feriado[] {
  const out: Feriado[] = [];
  for (let ano = Number(ini.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano++)
    for (const f of feriadosNacionais(ano)) if (f.data >= ini && f.data <= fim) out.push(f);
  return out;
}

export interface EfeitoFeriados {
  /** Fator medido por nome de feriado (o mais recente com dado). */
  porNome: Map<string, number>;
  /** Média dos fatores medidos (vale para o feriado que ainda não teve medida). null = nenhum medido. */
  geral: number | null;
}

/**
 * Mede o efeito dos feriados dos últimos 2 anos nas vendas. `vendas` é a venda por dia ("AAAA-MM-DD" → total).
 * Só conta feriado depois da primeira venda registrada e com base (mesmo dia da semana) acima de zero.
 */
export function medirEfeitoFeriados(
  vendasPorDia: Map<string, number>,
  hoje: string,
): EfeitoFeriados {
  const datas = [...vendasPorDia.keys()].sort();
  const porNome = new Map<string, number>();
  if (!datas.length) return { porNome, geral: null };
  const primeira = datas[0];
  const passados = feriadosEntre(addDays(hoje, -730), addDays(hoje, -1)).filter(
    (f) => f.data >= primeira,
  );
  const ehFeriado = new Set(feriadosEntre(addDays(hoje, -800), hoje).map((f) => f.data));
  const fatores: number[] = [];
  for (const f of passados) {
    const base: number[] = [];
    for (const k of [-4, -3, -2, -1, 1, 2, 3, 4]) {
      const d = addDays(f.data, 7 * k);
      if (d < primeira || d >= hoje || ehFeriado.has(d)) continue;
      base.push(vendasPorDia.get(d) ?? 0);
    }
    if (base.length < 3) continue;
    const media = base.reduce((a, b) => a + b, 0) / base.length;
    if (media <= 0) continue;
    const fator = Math.min(3, (vendasPorDia.get(f.data) ?? 0) / media);
    porNome.set(f.nome, Math.round(fator * 100) / 100); // os feriados vêm em ordem: fica o mais recente
    fatores.push(fator);
  }
  const geral = fatores.length
    ? Math.round((fatores.reduce((a, b) => a + b, 0) / fatores.length) * 100) / 100
    : null;
  return { porNome, geral };
}
