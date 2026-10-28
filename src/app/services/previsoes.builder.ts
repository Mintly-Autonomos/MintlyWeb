/**
 * Previsões a partir dos lançamentos reais. Funções puras: recebem os lançamentos e os saldos e
 * devolvem a projeção de caixa/lucro e o simulador "E se...?".
 *
 * Modelo (datas "AAAA-MM-DD", dinheiro em reais):
 *  - Já lançado e ainda não liquidado (pendente) entra no dia do vencimento — é o "dinheiro que
 *    está em Movimentações" (ex.: venda do iFood que cai em 30 dias).
 *  - O que costuma acontecer à vista (liquidado sem prazo) segue o ritmo médio dos últimos 30 dias.
 *  - O simulador mexe só no ritmo (vendas, preço, custo); o que já está lançado não muda.
 */

export type Horizonte = 30 | 60 | 90;
export type Metric = 'caixa' | 'receita' | 'lucro';

export const METRICAS: { value: Metric; label: string; icon: string; desc: string }[] = [
  {
    value: 'caixa',
    label: 'Caixa',
    icon: 'account_balance_wallet',
    desc: 'Saldo acumulado projetado',
  },
  {
    value: 'receita',
    label: 'Receita',
    icon: 'trending_up',
    desc: 'Faturamento acumulado no período',
  },
  { value: 'lucro', label: 'Lucro', icon: 'savings', desc: 'Quanto deve sobrar no período' },
];

/** Janela de histórico usada para o ritmo diário e para a parte "realizada" do gráfico. */
export const PASSADO = 30;

export interface PrevMov {
  tipo: 'in' | 'out';
  /** Quando o dinheiro entra/sai: liquidado = settledAt ?? vencimento ?? data; pendente = vencimento ?? data. */
  date: string;
  /** Entrada: valor líquido (após taxa de plataforma). Saída: valor bruto. */
  valor: number;
  pendente: boolean;
  /** Só saídas: fração que varia com as vendas (CMV = 1, fixa = 0, mista = 0,5). */
  variavel: number;
  /** Liquidado sem prazo (entrou/saiu no dia do lançamento): compõe o ritmo diário. */
  aVista: boolean;
}

export interface PrevBase {
  hoje: string;
  caixaHoje: number;
  /** Imposto sobre venda (fração da receita). */
  aliquota: number;
  receitaDia: number;
  custoVarDia: number;
  custoFixoDia: number;
  /** Lançamentos pendentes (vencimento dentro do horizonte), já com data ajustada (vencidos → amanhã). */
  pendentes: { date: string; tipo: 'in' | 'out'; valor: number; variavel: number }[];
  /** Resultado de caixa (entradas − saídas) liquidado em cada um dos últimos 30 dias. */
  realizado: Record<string, number>;
  temDados: boolean;
}

// ── datas ───────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const label = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const money = (n: number) => Math.round(n * 100) / 100;

export function buildBase(
  movs: PrevMov[],
  caixaHoje: number,
  aliquota: number,
  hoje: string,
): PrevBase {
  const ini = addDays(hoje, -(PASSADO - 1));
  let receita = 0;
  let custoVar = 0;
  let custoFixo = 0;
  const realizado: Record<string, number> = {};
  const pendentes: PrevBase['pendentes'] = [];

  for (const m of movs) {
    if (m.pendente) {
      pendentes.push({
        // Vencido e ainda pendente: o dinheiro deve mexer logo — amanhã.
        date: m.date <= hoje ? addDays(hoje, 1) : m.date,
        tipo: m.tipo,
        valor: m.valor,
        variavel: m.variavel,
      });
      continue;
    }
    if (m.date < ini || m.date > hoje) continue;
    realizado[m.date] = (realizado[m.date] ?? 0) + (m.tipo === 'in' ? m.valor : -m.valor);
    if (!m.aVista) continue;
    if (m.tipo === 'in') receita += m.valor;
    else {
      custoVar += m.valor * m.variavel;
      custoFixo += m.valor * (1 - m.variavel);
    }
  }

  return {
    hoje,
    caixaHoje,
    aliquota,
    receitaDia: receita / PASSADO,
    custoVarDia: custoVar / PASSADO,
    custoFixoDia: custoFixo / PASSADO,
    pendentes,
    realizado,
    temDados: movs.length > 0,
  };
}

// ── simulador ───────────────────────────────────────────────────────────
export interface Ajustes {
  preco: number;
  volume: number;
  custo: number;
}
export const AJUSTES_ZERO: Ajustes = { preco: 0, volume: 0, custo: 0 };
export const isDefault = (a: Ajustes): boolean => a.preco === 0 && a.volume === 0 && a.custo === 0;

export type LeverKey = 'volume' | 'preco' | 'custo' | 'cenario';
export type Cenario = 'fraco' | 'normal' | 'cheio';

/** Alavancas em % sobre o ritmo atual (cenário = ±25% de vendas). */
export interface Alavancas {
  volume: number;
  preco: number;
  custo: number;
  cenario: Cenario;
}
export const ALAVANCAS_ZERO: Alavancas = { volume: 0, preco: 0, custo: 0, cenario: 'normal' };

export const alavancaNoNormal = (a: Alavancas, k: LeverKey): boolean =>
  k === 'cenario' ? a.cenario === 'normal' : a[k] === 0;

export function ajustesDe(a: Alavancas, ativa: LeverKey): Ajustes {
  if (ativa === 'volume') return { ...AJUSTES_ZERO, volume: a.volume };
  if (ativa === 'preco') return { ...AJUSTES_ZERO, preco: a.preco };
  if (ativa === 'custo') return { ...AJUSTES_ZERO, custo: a.custo };
  return { ...AJUSTES_ZERO, volume: a.cenario === 'fraco' ? -25 : a.cenario === 'cheio' ? 25 : 0 };
}

export type SimMetric = 'caixa' | 'lucro';

export interface SimPonto {
  label: string;
  real: number | null;
  previsto: number | null;
  base: number | null;
  faixa: [number, number] | null;
}

export interface ResultadoSim {
  receita: number;
  custoVariavel: number;
  custoFixo: number;
  impostos: number;
  lucro: number;
  margem: number;
  caixaFim: number;
  caixaMinimo: number;
  caixaMinimoLabel: string;
}

export interface Simulacao {
  resultado: ResultadoSim;
  pontos: SimPonto[];
  pontosLucro: SimPonto[];
  acumSim: number;
  acumBase: number;
}

interface DiaSim {
  label: string;
  futuro: boolean;
  fIdx: number;
  lucroBase: number;
  lucroSim: number;
  rec: number;
  cv: number;
  cf: number;
}

export function simular(ajustes: Ajustes, horizonte: Horizonte, base: PrevBase): Simulacao {
  const p = ajustes.preco / 100;
  const v = ajustes.volume / 100;
  const c = ajustes.custo / 100;

  // Pendentes agrupados por dia (dentro do horizonte).
  const fim = addDays(base.hoje, horizonte);
  const porDia = new Map<string, { in: number; outVar: number; outFixo: number }>();
  for (const x of base.pendentes) {
    if (x.date > fim) continue;
    const d = porDia.get(x.date) ?? { in: 0, outVar: 0, outFixo: 0 };
    if (x.tipo === 'in') d.in += x.valor;
    else {
      d.outVar += x.valor * x.variavel;
      d.outFixo += x.valor * (1 - x.variavel);
    }
    porDia.set(x.date, d);
  }

  const ini = addDays(base.hoje, -(PASSADO - 1));
  const serie: DiaSim[] = [];
  for (let i = 0; i < PASSADO + horizonte; i++) {
    const date = addDays(ini, i);
    const futuro = i >= PASSADO;
    const fIdx = i - PASSADO + 1;
    if (!futuro) {
      const lucro = base.realizado[date] ?? 0;
      serie.push({
        label: label(date),
        futuro,
        fIdx,
        lucroBase: lucro,
        lucroSim: lucro,
        rec: 0,
        cv: 0,
        cf: 0,
      });
      continue;
    }
    const pend = porDia.get(date) ?? { in: 0, outVar: 0, outFixo: 0 };
    const recBase = base.receitaDia + pend.in;
    const cvBase = base.custoVarDia + pend.outVar;
    const cfBase = base.custoFixoDia + pend.outFixo;
    const recSim = base.receitaDia * (1 + p) * (1 + v) + pend.in;
    const cvSim = base.custoVarDia * (1 + v) * (1 + c) + pend.outVar;
    const lucroBase = recBase - cvBase - cfBase - recBase * base.aliquota;
    const lucroSim = recSim - cvSim - cfBase - recSim * base.aliquota;
    serie.push({
      label: label(date),
      futuro,
      fIdx,
      lucroBase,
      lucroSim,
      rec: recSim,
      cv: cvSim,
      cf: cfBase,
    });
  }

  // Caixa de antes da janela: desfaz o que foi liquidado nos últimos 30 dias.
  let caixaInicial = base.caixaHoje;
  for (let i = 0; i < PASSADO; i++) caixaInicial -= serie[i].lucroBase;

  const step = horizonte <= 30 ? 2 : horizonte <= 60 ? 4 : 6;
  let caixaSim = caixaInicial;
  let caixaBase = caixaInicial;
  let acumSim = 0;
  let acumBase = 0;
  let caixaMinimo = Number.POSITIVE_INFINITY;
  let caixaMinimoLabel = '';
  let receita = 0;
  let custoVariavel = 0;
  let custoFixo = 0;

  const mmWin: number[] = [];
  const mmWinBase: number[] = [];
  const media = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

  const pontos: SimPonto[] = [];
  const pontosLucro: SimPonto[] = [];

  for (let i = 0; i < serie.length; i++) {
    const d = serie[i];
    caixaSim += d.lucroSim;
    caixaBase += d.lucroBase;
    if (d.futuro) {
      acumSim += d.lucroSim;
      acumBase += d.lucroBase;
      receita += d.rec;
      custoVariavel += d.cv;
      custoFixo += d.cf;
    }
    mmWin.push(d.lucroSim);
    mmWinBase.push(d.lucroBase);
    if (mmWin.length > 7) mmWin.shift();
    if (mmWinBase.length > 7) mmWinBase.shift();

    if (d.futuro && caixaSim < caixaMinimo) {
      caixaMinimo = caixaSim;
      caixaMinimoLabel = d.label;
    }

    const inc = d.futuro ? Math.min(0.18, 0.04 + 0.0035 * d.fIdx) : 0;
    const mostra = !d.futuro
      ? i % 3 === 0 || i === PASSADO - 1
      : d.fIdx % step === 0 || d.fIdx === horizonte;
    if (!mostra) continue;

    const pushPonto = (arr: SimPonto[], sim: number, bse: number) => {
      const val = Math.round(sim);
      if (!d.futuro) {
        const ultimo = i === PASSADO - 1;
        arr.push({
          label: d.label,
          real: val,
          previsto: ultimo ? val : null,
          base: ultimo ? val : null,
          faixa: ultimo ? [val, val] : null,
        });
        return;
      }
      arr.push({
        label: d.label,
        real: null,
        previsto: val,
        base: Math.round(bse),
        faixa: [Math.round(val - Math.abs(val) * inc), Math.round(val + Math.abs(val) * inc)],
      });
    };

    pushPonto(pontos, caixaSim, caixaBase);
    pushPonto(pontosLucro, media(mmWin) * 30, media(mmWinBase) * 30);
  }

  const impostos = receita * base.aliquota;
  const lucro = receita - custoVariavel - custoFixo - impostos;

  const resultado: ResultadoSim = {
    receita: money(receita),
    custoVariavel: money(custoVariavel),
    custoFixo: money(custoFixo),
    impostos: money(impostos),
    lucro: money(lucro),
    margem: receita > 0 ? (lucro / receita) * 100 : 0,
    caixaFim: money(caixaSim),
    caixaMinimo: money(caixaMinimo === Number.POSITIVE_INFINITY ? caixaSim : caixaMinimo),
    caixaMinimoLabel,
  };

  return { resultado, pontos, pontosLucro, acumSim: money(acumSim), acumBase: money(acumBase) };
}
