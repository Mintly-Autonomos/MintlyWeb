/**
 * Previsões a partir dos lançamentos reais. Funções puras: recebem os lançamentos e os saldos e
 * devolvem a projeção de caixa/lucro e o simulador "E se...?".
 *
 * Modelo (datas "AAAA-MM-DD", dinheiro em reais):
 *  - Já lançado e ainda não liquidado (pendente) entra no dia do vencimento — é o "dinheiro que
 *    está em Movimentações" (ex.: venda do iFood que cai em 30 dias).
 *  - Vendas: P.5 — a venda prevista de cada dia vem de `preverVendas` (previsoes-sazonal.ts): com menos de 3 meses de
 *    histórico, o ritmo dos últimos 30 dias; de 3 a 11, a média de 90 dias × dia da semana; com 12 ou mais, o mesmo
 *    mês do ano anterior × crescimento. A divisão por prazo do repasse (cartão, iFood) segue a dos últimos 30 dias:
 *    a venda com repasse só vira dinheiro depois do prazo dela; antes disso o caixa já tem os repasses pendentes.
 *  - O custo variável acompanha as vendas previstas (mais vendas, mais insumo); o fixo segue o ritmo de 30 dias.
 *  - Custos: o que costuma sair à vista (liquidado sem prazo) segue o ritmo médio dos últimos 30 dias.
 *  - Não operacional (empréstimo, aporte, equipamento) não entra no ritmo: não se repete todo mês.
 *  - O simulador mexe só no ritmo (vendas, preço, custo); o que já está lançado não muda.
 */

import { PrevisaoVendas, VendaHist, preverVendas } from './previsoes-sazonal';

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
  /** Liquidado sem prazo (entrou/saiu no dia do lançamento): compõe o ritmo diário dos custos. */
  aVista: boolean;
  /** Data do lançamento (o dia da venda), "AAAA-MM-DD": é por ela que o ritmo de vendas é medido. */
  lancamento: string;
  /** Dias entre o lançamento e o dinheiro (repasse do cartão/iFood). 0 = à vista. */
  prazo: number;
  /** Categoria "Não operacional" (empréstimo, aporte, equipamento): fica fora do ritmo. */
  naoOperacional: boolean;
}

export interface PrevBase {
  hoje: string;
  caixaHoje: number;
  /** Imposto sobre venda (fração da receita). */
  aliquota: number;
  /** T1: DAS do MEI por dia (fixo do mês ÷ 30). Não muda com as vendas. Ausente = 0. */
  impostoFixoDia?: number;
  /** Ritmo de vendas por dia (todas as formas de pagamento). */
  receitaDia: number;
  /** O mesmo ritmo separado pelo prazo do repasse: a parte com prazo P só vira dinheiro a partir do dia P+1. */
  receitaPrazos?: { prazo: number; porDia: number }[];
  custoVarDia: number;
  custoFixoDia: number;
  /** P.5: venda prevista em cada dia futuro e o nível do modelo. Ausente: ritmo de 30 dias em todo dia. */
  previsao?: PrevisaoVendas;
  /** Lançamentos pendentes (vencimento dentro do horizonte), já com data ajustada (vencidos → amanhã). */
  pendentes: {
    date: string;
    tipo: 'in' | 'out';
    valor: number;
    variavel: number;
    naoOperacional?: boolean;
    /** Já venceu (estava para hoje ou antes): vale para o caixa de amanhã, mas é custo de mês passado, não lucro. */
    vencido?: boolean;
  }[];
  /** Resultado de caixa (entradas − saídas) liquidado em cada um dos últimos 30 dias. */
  realizado: Record<string, number>;
  /**
   * P.9: lucro de cada um dos últimos 30 dias pela data da VENDA (vendas − imposto − saídas operacionais pagas),
   * para o gráfico de lucro não mostrar variação de caixa. Ausente: usa `realizado`.
   */
  realizadoLucro?: Record<string, number>;
  /** P.4: vendas por mês FECHADO pela data da venda ("AAAA-MM" → total), base da produtividade da equipe. */
  historicoMensal?: Record<string, number>;
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

/** Vendas por mês já fechado (antes do mês de `hoje`). */
function porMesFechado(vendas: VendaHist[], hoje: string): Record<string, number> {
  const mesAtual = hoje.slice(0, 7);
  const out: Record<string, number> = {};
  for (const v of vendas) {
    const ym = v.data.slice(0, 7);
    if (ym < mesAtual) out[ym] = (out[ym] ?? 0) + v.valor;
  }
  return out;
}

export function buildBase(
  movs: PrevMov[],
  caixaHoje: number,
  aliquota: number,
  hoje: string,
  impostoFixoMes = 0,
): PrevBase {
  const ini = addDays(hoje, -(PASSADO - 1));
  let receita = 0;
  let custoVar = 0;
  let custoFixo = 0;
  const realizado: Record<string, number> = {};
  const realizadoLucro: Record<string, number> = {};
  const pendentes: PrevBase['pendentes'] = [];
  const vendasPorPrazo = new Map<number, number>();
  const historico: VendaHist[] = [];

  for (const m of movs) {
    if (m.tipo === 'in' && !m.naoOperacional && m.lancamento <= hoje)
      historico.push({ data: m.lancamento, valor: m.valor });
    if (m.tipo === 'in' && !m.naoOperacional && m.lancamento >= ini && m.lancamento <= hoje)
      realizadoLucro[m.lancamento] = (realizadoLucro[m.lancamento] ?? 0) + m.valor * (1 - aliquota);
    // Ritmo de vendas pela data da venda, pendente ou já recebida (cartão e iFood ficam pendentes até o repasse).
    if (m.tipo === 'in' && !m.naoOperacional && m.lancamento >= ini && m.lancamento <= hoje) {
      const prazo = Math.max(0, Math.round(m.prazo));
      vendasPorPrazo.set(prazo, (vendasPorPrazo.get(prazo) ?? 0) + m.valor);
    }
    if (m.pendente) {
      pendentes.push({
        // Vencido e ainda pendente: o dinheiro deve mexer logo — amanhã.
        date: m.date <= hoje ? addDays(hoje, 1) : m.date,
        tipo: m.tipo,
        valor: m.valor,
        variavel: m.variavel,
        naoOperacional: m.naoOperacional,
        ...(m.date <= hoje ? { vencido: true } : {}),
      });
      continue;
    }
    if (m.date < ini || m.date > hoje) continue;
    realizado[m.date] = (realizado[m.date] ?? 0) + (m.tipo === 'in' ? m.valor : -m.valor);
    if (m.tipo === 'out' && !m.naoOperacional)
      realizadoLucro[m.date] = (realizadoLucro[m.date] ?? 0) - m.valor;
    if (!m.aVista || m.tipo === 'in' || m.naoOperacional) continue;
    custoVar += m.valor * m.variavel;
    custoFixo += m.valor * (1 - m.variavel);
  }
  for (const total of vendasPorPrazo.values()) receita += total;
  const receitaPrazos = [...vendasPorPrazo.entries()]
    .sort(([a], [b]) => a - b)
    .map(([prazo, total]) => ({ prazo, porDia: total / PASSADO }));

  return {
    hoje,
    caixaHoje,
    aliquota,
    impostoFixoDia: impostoFixoMes > 0 ? impostoFixoMes / 30 : 0,
    receitaDia: receita / PASSADO,
    receitaPrazos,
    custoVarDia: custoVar / PASSADO,
    custoFixoDia: custoFixo / PASSADO,
    previsao: preverVendas(historico, hoje, receita / PASSADO),
    historicoMensal: porMesFechado(historico, hoje),
    pendentes,
    realizado,
    realizadoLucro,
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

/** P.6: elasticidade usada na alavanca de preço do simulador geral (clientes medianamente sensíveis). */
export const ELASTICIDADE_GERAL = -1.8;

/** Queda (ou alta) de volume, em %, de mudar todos os preços em `preco`% (elasticidade constante). */
export const volumeDoPreco = (preco: number, e = ELASTICIDADE_GERAL): number =>
  preco === 0 ? 0 : Math.round((Math.pow(1 + preco / 100, e) - 1) * 1000) / 10;

export function ajustesDe(a: Alavancas, ativa: LeverKey): Ajustes {
  if (ativa === 'volume') return { ...AJUSTES_ZERO, volume: a.volume };
  // P.6: subir o preço também tira vendas; antes +10% de preço dava +10% de receita sem perder ninguém.
  if (ativa === 'preco') return { ...AJUSTES_ZERO, preco: a.preco, volume: volumeDoPreco(a.preco) };
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

/**
 * P.9: receita, custos, impostos, lucro e margem são pela data da VENDA (o que o período fatura e quanto sobra).
 * O caixa (`caixaFim`, `entradas`) é pela data do dinheiro: conta repasses de vendas antigas, o prazo do cartão
 * e o que é não operacional (empréstimo, aporte).
 */
export interface ResultadoSim {
  /** Vendas previstas no período (faturamento). */
  receita: number;
  /** Dinheiro que entra no período: vendas que viram dinheiro + recebimentos já lançados. */
  entradas: number;
  /** Imposto sobre as entradas de caixa (para conciliar com o Fluxo). */
  impostosCaixa: number;
  custoVariavel: number;
  custoFixo: number;
  impostos: number;
  lucro: number;
  margem: number;
  caixaFim: number;
  caixaMinimo: number;
  caixaMinimoLabel: string;
  /** Contas já vencidas que o caixa paga no horizonte (fora do lucro previsto). */
  vencidas: number;
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
  /** Vendas do dia (pela data da venda) e o lucro delas. */
  vendas: number;
  lucroComp: number;
  lucroCompBase: number;
  cv: number;
  cf: number;
  /** Entradas − saídas não operacionais do dia (empréstimo, parcelas, equipamento): mexem no caixa, não no lucro. */
  /** Contas vencidas pagas no dia (só caixa; fora do lucro previsto). */
  vencido: number;
  vencidoVar: number;
  naoOp: number;
}

/**
 * Ritmo de vendas que já virou dinheiro no dia k do futuro: a parte com prazo P só a partir do dia P+1
 * (as vendas de antes disso já estão nos repasses pendentes). Sem a separação por prazo, vale o ritmo todo.
 */
export function ritmoVendasNoDia(base: PrevBase, k: number): number {
  const prev = base.previsao;
  if (prev) {
    // P.5: o dinheiro do dia k é a venda prevista do dia k − P, para cada prazo P, na proporção dos últimos 30 dias.
    const partes =
      base.receitaPrazos && base.receitaDia > 0
        ? base.receitaPrazos.map((r) => ({ prazo: r.prazo, fracao: r.porDia / base.receitaDia }))
        : [{ prazo: 0, fracao: 1 }];
    return partes.reduce(
      (s, r) => s + (k > r.prazo ? r.fracao * (prev.porDia[k - r.prazo - 1] ?? 0) : 0),
      0,
    );
  }
  return base.receitaPrazos
    ? base.receitaPrazos.reduce((s, r) => s + (k > r.prazo ? r.porDia : 0), 0)
    : base.receitaDia;
}

/** Venda prevista no dia k do futuro, pela data da venda (P.5; sem previsão, o ritmo de 30 dias). */
export function vendasPrevistasNoDia(base: PrevBase, k: number): number {
  return base.previsao ? (base.previsao.porDia[k - 1] ?? 0) : base.receitaDia;
}

/** P.5: o custo variável do dia k acompanha a venda prevista do dia (contra o ritmo dos últimos 30 dias). */
export function custoVarNoDia(base: PrevBase, k: number): number {
  const prev = base.previsao;
  if (!prev || base.receitaDia <= 0) return base.custoVarDia;
  return base.custoVarDia * ((prev.porDia[k - 1] ?? base.receitaDia) / base.receitaDia);
}

export function simular(ajustes: Ajustes, horizonte: Horizonte, base: PrevBase): Simulacao {
  const p = ajustes.preco / 100;
  const v = ajustes.volume / 100;
  const c = ajustes.custo / 100;

  // Pendentes agrupados por dia (dentro do horizonte).
  const fim = addDays(base.hoje, horizonte);
  const vazio = () => ({ in: 0, outVar: 0, outFixo: 0, naoOp: 0, outVencido: 0, outVencidoVar: 0 });
  const porDia = new Map<string, ReturnType<typeof vazio>>();
  for (const x of base.pendentes) {
    if (x.date > fim) continue;
    const d = porDia.get(x.date) ?? vazio();
    if (x.naoOperacional) d.naoOp += x.tipo === 'in' ? x.valor : -x.valor;
    else if (x.tipo === 'in') d.in += x.valor;
    else {
      d.outVar += x.valor * x.variavel;
      d.outFixo += x.valor * (1 - x.variavel);
      if (x.vencido) {
        d.outVencido += x.valor;
        d.outVencidoVar += x.valor * x.variavel;
      }
    }
    porDia.set(x.date, d);
  }

  const ritmoNoDia = (k: number) => ritmoVendasNoDia(base, k);

  const ini = addDays(base.hoje, -(PASSADO - 1));
  const serie: DiaSim[] = [];
  for (let i = 0; i < PASSADO + horizonte; i++) {
    const date = addDays(ini, i);
    const futuro = i >= PASSADO;
    const fIdx = i - PASSADO + 1;
    if (!futuro) {
      const lucro = base.realizado[date] ?? 0;
      const lucroComp = base.realizadoLucro ? (base.realizadoLucro[date] ?? 0) : lucro;
      serie.push({
        label: label(date),
        futuro,
        fIdx,
        lucroBase: lucro,
        lucroSim: lucro,
        lucroComp,
        lucroCompBase: lucroComp,
        vendas: 0,
        rec: 0,
        cv: 0,
        cf: 0,
        naoOp: 0,
        vencido: 0,
        vencidoVar: 0,
      });
      continue;
    }
    const pend = porDia.get(date) ?? vazio();
    const ritmo = ritmoNoDia(fIdx);
    const recBase = ritmo + pend.in;
    const cvDia = custoVarNoDia(base, fIdx);
    const cvBase = cvDia + pend.outVar;
    const cfBase = base.custoFixoDia + pend.outFixo;
    const recSim = ritmo * (1 + p) * (1 + v) + pend.in;
    const cvSim = cvDia * (1 + v) * (1 + c) + pend.outVar;
    // T1: o DAS do MEI é fixo por dia (não sobe nem desce com as vendas simuladas).
    const fixoDia = base.impostoFixoDia ?? 0;
    const lucroBase = recBase - cvBase - cfBase - recBase * base.aliquota - fixoDia;
    const lucroSim = recSim - cvSim - cfBase - recSim * base.aliquota - fixoDia;
    // P.9: o lucro do dia é pela venda do dia, sem repasses de vendas antigas nem o atraso do cartão.
    const vendasBase = vendasPrevistasNoDia(base, fIdx);
    const vendasSim = vendasBase * (1 + p) * (1 + v);
    // Reteste 18/11, item 9: conta a pagar vencida sai do caixa (amanhã), mas não é lucro do período previsto.
    const lucroCompBase =
      vendasBase * (1 - base.aliquota) - cvBase - cfBase - fixoDia + pend.outVencido;
    const lucroComp = vendasSim * (1 - base.aliquota) - cvSim - cfBase - fixoDia + pend.outVencido;
    serie.push({
      label: label(date),
      futuro,
      fIdx,
      lucroBase,
      lucroSim,
      lucroComp,
      lucroCompBase,
      vendas: vendasSim,
      rec: recSim,
      cv: cvSim,
      cf: cfBase,
      naoOp: pend.naoOp,
      vencido: pend.outVencido,
      vencidoVar: pend.outVencidoVar,
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
  let entradas = 0;
  let custoVariavel = 0;
  let custoFixo = 0;
  let vencidas = 0;
  let vencidasVar = 0;

  const mmWin: number[] = [];
  const mmWinBase: number[] = [];
  const media = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

  const pontos: SimPonto[] = [];
  const pontosLucro: SimPonto[] = [];

  for (let i = 0; i < serie.length; i++) {
    const d = serie[i];
    // Caixa = lucro do dia + o que entra/sai fora da operação (parcela de empréstimo, aporte...).
    caixaSim += d.lucroSim + d.naoOp;
    caixaBase += d.lucroBase + d.naoOp;
    if (d.futuro) {
      acumSim += d.lucroSim;
      acumBase += d.lucroBase;
      receita += d.vendas;
      entradas += d.rec;
      custoVariavel += d.cv;
      custoFixo += d.cf;
      vencidas += d.vencido;
      vencidasVar += d.vencidoVar;
    }
    mmWin.push(d.lucroComp);
    mmWinBase.push(d.lucroCompBase);
    if (mmWin.length > 7) mmWin.shift();
    if (mmWinBase.length > 7) mmWinBase.shift();

    if (d.futuro && caixaSim < caixaMinimo) {
      caixaMinimo = caixaSim;
      caixaMinimoLabel = d.label;
    }

    // P.5: com erro medido nos meses fechados, a faixa cresce até ele no primeiro mês; sem ele, a faixa fixa de antes.
    const erro = base.previsao?.erroMedio ?? null;
    const inc = !d.futuro
      ? 0
      : erro !== null
        ? Math.min(0.5, erro * Math.min(1, d.fIdx / 30))
        : Math.min(0.18, 0.04 + 0.0035 * d.fIdx);
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

  const impostoFixo = (base.impostoFixoDia ?? 0) * horizonte;
  const impostos = receita * base.aliquota + impostoFixo;
  // Reteste 18/11, item 9: as vencidas saem dos custos do período (são de meses passados); ficam só no caixa.
  custoVariavel = Math.max(0, custoVariavel - vencidasVar);
  custoFixo = Math.max(0, custoFixo - (vencidas - vencidasVar));
  const lucro = receita - custoVariavel - custoFixo - impostos;

  const resultado: ResultadoSim = {
    receita: money(receita),
    entradas: money(entradas),
    impostosCaixa: money(entradas * base.aliquota + impostoFixo),
    custoVariavel: money(custoVariavel),
    custoFixo: money(custoFixo),
    impostos: money(impostos),
    lucro: money(lucro),
    margem: receita > 0 ? (lucro / receita) * 100 : 0,
    caixaFim: money(caixaSim),
    caixaMinimo: money(caixaMinimo === Number.POSITIVE_INFINITY ? caixaSim : caixaMinimo),
    caixaMinimoLabel,
    vencidas: money(vencidas),
  };

  return { resultado, pontos, pontosLucro, acumSim: money(acumSim), acumBase: money(acumBase) };
}

/**
 * Da projeção do Fluxo de caixa (só o que já está lançado) até o caixa das Previsões (relatório S2.2).
 * `lancado` é o saldo do Fluxo no fim do horizonte; o resto é o que as Previsões somam a ele:
 * vendas e custos no ritmo dos últimos 30 dias e o imposto sobre as vendas do período. `ajustes` fecha a
 * conta (vencidos contados para amanhã, diferença no caixa de hoje) e costuma ser pequeno.
 */
export interface Conciliacao {
  lancado: number;
  ritmoVendas: number;
  ritmoCustos: number;
  imposto: number;
  ajustes: number;
  previsao: number;
}

export function conciliar(base: PrevBase, horizonte: Horizonte, lancado: number): Conciliacao {
  const { resultado } = simular(AJUSTES_ZERO, horizonte, base);
  let ritmoVendas = 0;
  for (let k = 1; k <= horizonte; k++) ritmoVendas += ritmoVendasNoDia(base, k);
  let ritmoCustos = 0;
  for (let k = 1; k <= horizonte; k++) ritmoCustos += custoVarNoDia(base, k) + base.custoFixoDia;
  const imposto = resultado.impostosCaixa;
  const previsao = resultado.caixaFim;
  const ajustes = previsao - (lancado + ritmoVendas - ritmoCustos - imposto);
  return {
    lancado: money(lancado),
    ritmoVendas: money(ritmoVendas),
    ritmoCustos: money(ritmoCustos),
    imposto: money(imposto),
    ajustes: money(ajustes),
    previsao: money(previsao),
  };
}
