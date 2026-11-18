import type { ReceitaMov } from './receitas.builder';

/**
 * "Quando você mais vende" com Dia / Semana / Mês / Ano (relatório Sweetie Bel, P.7 / seção 13.2). Pura (testada sem
 * tela). Usa o dia da VENDA (não o do repasse). As vendas que chegam já são as do período escolhido na tela, menos o
 * modo "Ano", que olha os 12 meses até o fim do período.
 */

export type ModoQuando = 'dia' | 'semana' | 'mes' | 'ano';

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const money = (n: number) => Math.round(n * 100) / 100;
const dataDaVenda = (m: ReceitaMov) => m.saleDate ?? m.date;
const diaDaSemana = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return (new Date(y, mo - 1, d).getDay() + 6) % 7;
};

/** Por hora do dia (só vendas com hora). `semHora` = quantas vendas do período não têm hora. */
export function porHora(sel: ReceitaMov[]): {
  pontos: { hora: string; valor: number }[];
  semHora: number;
} {
  const v = new Array<number>(24).fill(0);
  let semHora = 0;
  for (const m of sel) {
    if (!m.saleTime) {
      semHora += m.salesCount ?? 1;
      continue;
    }
    v[Number(m.saleTime.slice(0, 2))] += m.gross;
  }
  const comVenda = v.map((x, h) => ({ h, x })).filter((p) => p.x > 0);
  if (comVenda.length === 0) return { pontos: [], semHora };
  const de = Math.min(...comVenda.map((p) => p.h));
  const ate = Math.max(...comVenda.map((p) => p.h));
  const pontos = [];
  for (let h = de; h <= ate; h++)
    pontos.push({ hora: `${String(h).padStart(2, '0')}h`, valor: money(v[h]) });
  return { pontos, semHora };
}

/** Por dia da semana, com o índice contra a média dos dias (1,40 = 40% acima da média). */
export function porDiaDaSemana(
  sel: ReceitaMov[],
): { dia: string; valor: number; indice: number }[] {
  const v = new Array<number>(7).fill(0);
  for (const m of sel) v[diaDaSemana(dataDaVenda(m))] += m.gross;
  const media = v.reduce((a, b) => a + b, 0) / 7;
  return DIAS.map((dia, i) => ({
    dia,
    valor: money(v[i]),
    indice: media > 0 ? Math.round((v[i] / media) * 100) / 100 : 0,
  }));
}

/** Por dia do mês (1 a 31), somando os meses do período. */
export function porDiaDoMes(sel: ReceitaMov[]): { dia: string; valor: number }[] {
  const v = new Array<number>(32).fill(0);
  for (const m of sel) v[Number(dataDaVenda(m).slice(8, 10))] += m.gross;
  const ultimo = Math.max(28, ...v.map((x, d) => (x > 0 ? d : 0)));
  const pontos = [];
  for (let d = 1; d <= ultimo; d++) pontos.push({ dia: String(d), valor: money(v[d]) });
  return pontos;
}

/** Os 12 meses até `fim` ("AAAA-MM-DD"), com o mesmo mês do ano anterior. */
export function porMesDoAno(
  todas: ReceitaMov[],
  fim: string,
): { mes: string; valor: number; anoAnterior: number }[] {
  const soma = new Map<string, number>();
  for (const m of todas) {
    const k = dataDaVenda(m).slice(0, 7);
    soma.set(k, (soma.get(k) ?? 0) + m.gross);
  }
  const [y, mo] = fim.split('-').map(Number);
  const pontos = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ka = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    pontos.push({
      mes: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      valor: money(soma.get(k) ?? 0),
      anoAnterior: money(soma.get(ka) ?? 0),
    });
  }
  return pontos;
}
