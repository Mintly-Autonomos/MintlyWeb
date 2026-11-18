/**
 * Previsão de vendas por dia (relatório Sweetie Bel, P.5 / seção 12.6). Pura (testada sem tela).
 *
 * Três níveis, conforme o histórico (meses COMPLETOS com venda, do primeiro mês com venda até o mês passado):
 *  - "ritmo"   (< 3 meses): o ritmo dos últimos 30 dias, igual para todo dia (o que existia antes), com aviso.
 *  - "media"   (3 a 11 meses, ou sem o mesmo mês do ano anterior): média por dia dos últimos 90 dias × efeito do
 *              dia da semana (sábado que vende 1,40× a média pesa 1,40×; dia em que a loja fecha pesa 0).
 *  - "sazonal" (12 meses ou mais): previsão do mês = mesmo mês do ano anterior × fator de crescimento,
 *              fator = média dos últimos 6 meses ÷ média dos 6 meses anteriores; o total do mês se espalha pelos
 *              dias pelo efeito do dia da semana.
 * O erro médio sai de testar o mesmo método nos meses já fechados (backtest), em vez de uma faixa fixa.
 * Feriados nacionais (feriados.ts) entram nos níveis "media" e "sazonal", com o efeito medido no histórico: no
 * "sazonal" eles só redistribuem o total do mês entre os dias (o mês do ano anterior já tinha o feriado); no
 * "media" a venda do dia do feriado é multiplicada pelo fator medido.
 */

import { feriadosEntre, medirEfeitoFeriados } from './feriados';

export type NivelPrevisao = 'ritmo' | 'media' | 'sazonal';

export interface VendaHist {
  /** Dia da venda, "AAAA-MM-DD". */
  data: string;
  valor: number;
}

export interface PrevisaoVendas {
  nivel: NivelPrevisao;
  /** Vendas previstas em cada dia futuro: índice 0 = amanhã. */
  porDia: number[];
  /** Meses completos com histórico. */
  mesesHistorico: number;
  /** Só no nível sazonal. */
  crescimento: number | null;
  /** Erro médio do método nos meses já fechados (0,08 = costuma errar ±8%); null sem meses para testar. */
  erroMedio: number | null;
  /** Feriados nacionais no horizonte, com o fator usado (1 = sem efeito medido). */
  feriados: { data: string; nome: string; fator: number; medido: boolean }[];
  /** Previsão de cada mês que o horizonte toca ("Dez/26" → total previsto no mês inteiro). */
  meses: { ym: string; mes: string; previsto: number; anoAnterior: number | null }[];
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
/** "AAAA-MM" deslocado n meses. */
const addMes = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const diasNoMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const rotuloMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const diaSemana = (s: string) => parse(s).getDay();
const money = (n: number) => Math.round(n * 100) / 100;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** Crescimento muito fora da curva costuma ser dado incompleto: limita entre 0,5× e 2×. */
const limita = (g: number) => Math.min(2, Math.max(0.5, g));

/** Efeito de cada dia da semana (0 = domingo) nos 90 dias até `fim`: venda média do dia ÷ venda média por dia. */
export function efeitoDiaDaSemana(vendas: VendaHist[], fim: string): number[] {
  const ini = addDays(fim, -89);
  const soma = new Array<number>(7).fill(0);
  for (const v of vendas) if (v.data >= ini && v.data <= fim) soma[diaSemana(v.data)] += v.valor;
  const ocorrencias = new Array<number>(7).fill(0);
  for (let i = 0; i < 90; i++) ocorrencias[diaSemana(addDays(ini, i))]++;
  const porDia = soma.map((s, w) => s / ocorrencias[w]);
  const geral = soma.reduce((a, b) => a + b, 0) / 90;
  return geral > 0 ? porDia.map((x) => x / geral) : new Array<number>(7).fill(1);
}

function totaisPorMes(vendas: VendaHist[]): Map<string, number> {
  const t = new Map<string, number>();
  for (const v of vendas) {
    const k = v.data.slice(0, 7);
    t.set(k, (t.get(k) ?? 0) + v.valor);
  }
  return t;
}

/** Crescimento visto no mês `ym`: os 6 meses antes dele contra os 6 anteriores a esses. */
function crescimentoAte(tot: Map<string, number>, ym: string): number | null {
  const ult = [1, 2, 3, 4, 5, 6].map((i) => tot.get(addMes(ym, -i)) ?? 0);
  const ant = [7, 8, 9, 10, 11, 12].map((i) => tot.get(addMes(ym, -i)) ?? 0);
  const b = media(ant);
  return b > 0 ? limita(media(ult) / b) : null;
}

export function preverVendas(
  vendas: VendaHist[],
  hoje: string,
  ritmoDia: number,
  dias = 90,
): PrevisaoVendas {
  const tot = totaisPorMes(vendas);
  const mesAtual = hoje.slice(0, 7);
  const primeiro = [...tot.entries()]
    .filter(([k, v]) => v > 0 && k < mesAtual)
    .map(([k]) => k)
    .sort()[0];
  let mesesHistorico = 0;
  if (primeiro) for (let k = primeiro; k < mesAtual; k = addMes(k, 1)) mesesHistorico++;

  const futuros = Array.from({ length: dias }, (_, i) => addDays(hoje, i + 1));
  const mesesTocados = [...new Set(futuros.map((d) => d.slice(0, 7)))];
  const feriadosHorizonte = feriadosEntre(futuros[0], futuros[futuros.length - 1]);

  // ── nível "ritmo" ────────────────────────────────────────────────────
  if (mesesHistorico < 3) {
    return {
      nivel: 'ritmo',
      porDia: futuros.map(() => ritmoDia),
      mesesHistorico,
      crescimento: null,
      erroMedio: null,
      // Pouco histórico: os feriados aparecem, mas sem efeito (nada para medir).
      feriados: feriadosHorizonte.map((f) => ({ ...f, fator: 1, medido: false })),
      meses: mesesTocados.map((ym) => ({
        ym,
        mes: rotuloMes(ym),
        previsto: money(ritmoDia * diasNoMes(ym)),
        anoAnterior: null,
      })),
    };
  }

  const efeito = efeitoDiaDaSemana(vendas, hoje);
  // Feriados: fator medido por nome (ou a média dos medidos); sem medida, 1.
  const porDiaHist = new Map<string, number>();
  for (const v of vendas) porDiaHist.set(v.data, (porDiaHist.get(v.data) ?? 0) + v.valor);
  const efeitoFer = medirEfeitoFeriados(porDiaHist, hoje);
  const feriadoNoDia = new Map<string, { nome: string; fator: number; medido: boolean }>();
  for (const f of feriadosEntre(`${mesAtual}-01`, addDays(futuros[futuros.length - 1], 31))) {
    const medido = efeitoFer.porNome.get(f.nome) ?? efeitoFer.geral;
    feriadoNoDia.set(f.data, { nome: f.nome, fator: medido ?? 1, medido: medido !== null });
  }
  const fatorDia = (d: string) => feriadoNoDia.get(d)?.fator ?? 1;
  const peso = (d: string) => efeito[diaSemana(d)] * fatorDia(d);
  const feriados = feriadosHorizonte.map((f) => ({
    ...f,
    ...feriadoNoDia.get(f.data)!,
    data: f.data,
  }));
  const temAnoAnterior = mesesTocados.every((ym) => (tot.get(addMes(ym, -12)) ?? 0) > 0);
  const crescimento = mesesHistorico >= 12 ? crescimentoAte(tot, mesAtual) : null;

  // ── nível "sazonal" ──────────────────────────────────────────────────
  if (mesesHistorico >= 12 && temAnoAnterior && crescimento !== null) {
    const previstoMes = new Map(
      mesesTocados.map((ym) => [ym, (tot.get(addMes(ym, -12)) ?? 0) * crescimento]),
    );
    const pesoMes = new Map(
      mesesTocados.map((ym) => {
        let p = 0;
        for (let d = 1; d <= diasNoMes(ym); d++) p += peso(`${ym}-${pad(d)}`);
        return [ym, p];
      }),
    );
    // Backtest: o mesmo método nos meses fechados que têm o ano anterior e 12 meses antes deles.
    const erros: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const ym = addMes(mesAtual, -i);
      const real = tot.get(ym) ?? 0;
      const anoAnt = tot.get(addMes(ym, -12)) ?? 0;
      const g = crescimentoAte(tot, ym);
      if (real > 0 && anoAnt > 0 && g !== null && addMes(ym, -12) >= primeiro!)
        erros.push(Math.abs(anoAnt * g - real) / real);
    }
    return {
      nivel: 'sazonal',
      porDia: futuros.map((d) => {
        const ym = d.slice(0, 7);
        const p = pesoMes.get(ym) || 1;
        return (previstoMes.get(ym)! * peso(d)) / p;
      }),
      mesesHistorico,
      crescimento: Math.round(crescimento * 100) / 100,
      erroMedio: erros.length ? Math.round(media(erros) * 100) / 100 : null,
      feriados,
      meses: mesesTocados.map((ym) => ({
        ym,
        mes: rotuloMes(ym),
        previsto: money(previstoMes.get(ym)!),
        anoAnterior: money(tot.get(addMes(ym, -12)) ?? 0),
      })),
    };
  }

  // ── nível "media" ────────────────────────────────────────────────────
  const ini90 = addDays(hoje, -89);
  const base =
    vendas.filter((v) => v.data >= ini90 && v.data <= hoje).reduce((a, v) => a + v.valor, 0) / 90;
  // Backtest: média dos 90 dias antes de cada um dos últimos 3 meses fechados × dias do mês.
  const erros: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const ym = addMes(mesAtual, -i);
    const real = tot.get(ym) ?? 0;
    const fimAntes = addDays(`${ym}-01`, -1);
    if (real <= 0 || addMes(ym, -3) < primeiro!) continue;
    const iniAntes = addDays(fimAntes, -89);
    const b =
      vendas
        .filter((v) => v.data >= iniAntes && v.data <= fimAntes)
        .reduce((a, v) => a + v.valor, 0) / 90;
    erros.push(Math.abs(b * diasNoMes(ym) - real) / real);
  }
  const porDia = futuros.map((d) => base * peso(d));
  return {
    nivel: 'media',
    porDia,
    mesesHistorico,
    crescimento: null,
    erroMedio: erros.length ? Math.round(media(erros) * 100) / 100 : null,
    feriados,
    meses: mesesTocados.map((ym) => {
      let previsto = 0;
      for (let d = 1; d <= diasNoMes(ym); d++) previsto += base * peso(`${ym}-${pad(d)}`);
      return { ym, mes: rotuloMes(ym), previsto: money(previsto), anoAnterior: null };
    }),
  };
}
