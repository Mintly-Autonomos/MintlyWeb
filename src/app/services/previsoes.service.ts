import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type Severity = 'risco' | 'atencao' | 'oportunidade' | 'positivo';
export type Horizonte = 30 | 60 | 90;
export type Metric = 'caixa' | 'receita' | 'lucro';

export interface MesHist {
  mes: string;
  receita: number;
  despesa: number;
  lucro: number;
  caixa: number;
}

export interface DiaSemana {
  dia: string;
  diaCurto: string;
  peso: number;
  medio: number;
  pico: boolean;
}

export interface PontoProjecao {
  label: string;
  real: number | null;
  previsto: number | null;
  faixa: [number, number] | null;
}

export interface Projecao {
  pontos: PontoProjecao[];
  fim: number;
  fimLo: number;
  fimHi: number;
  minimo: number;
  minimoLabel: string;
}

export interface Insight {
  id: string;
  severidade: Severity;
  titulo: string;
  descricao: string;
  acao: string;
  destino: string;
  regra: string;
  prioridade: number;
}

export type Categoria = 'Frango' | 'Acompanhamento' | 'Bebida' | 'Sobremesa';

export interface ItemCardapio {
  nome: string;
  categoria: Categoria;
  qtdVendida: number;
  preco: number;
  custo: number;
  margem: number;
  margemPct: number;
}

export type Quadrante = 'estrela' | 'cavalo' | 'quebraCabeca' | 'repensar';

export interface QuadranteMeta {
  emoji: string;
  icon: string;
  label: string;
  explicacao: string;
  recomendacao: string;
  tone: 'mint' | 'ocean' | 'warning' | 'neutral';
}

export const REF_LABEL = 'Julho/2026';
export const CAIXA_HOJE = 18500;

export const HISTORICO: MesHist[] = [
  { mes: 'Fev', receita: 49800, despesa: 45900, lucro: 3900, caixa: 11200 },
  { mes: 'Mar', receita: 51600, despesa: 47300, lucro: 4300, caixa: 12600 },
  { mes: 'Abr', receita: 52900, despesa: 48350, lucro: 4550, caixa: 14100 },
  { mes: 'Mai', receita: 53400, despesa: 48620, lucro: 4780, caixa: 15400 },
  { mes: 'Jun', receita: 54200, despesa: 49100, lucro: 5100, caixa: 16900 },
  { mes: 'Jul', receita: 58400, despesa: 52028, lucro: 6372, caixa: 18500 },
];

const PESOS = [0.08, 0.09, 0.1, 0.11, 0.19, 0.23, 0.2];
const NOMES: [string, string][] = [
  ['Segunda', 'Seg'],
  ['Terça', 'Ter'],
  ['Quarta', 'Qua'],
  ['Quinta', 'Qui'],
  ['Sexta', 'Sex'],
  ['Sábado', 'Sáb'],
  ['Domingo', 'Dom'],
];
const RECEITA_SEMANA_MEDIA = 58400 / 4.3;

export const SAZONALIDADE_SEMANAL: DiaSemana[] = NOMES.map(([dia, curto], i) => ({
  dia,
  diaCurto: curto,
  peso: PESOS[i],
  medio: Math.round((RECEITA_SEMANA_MEDIA * PESOS[i]) / 10) * 10,
  pico: i >= 4,
}));

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

const REF_MES = 7;
const REF_DIA = 31;
const dowFrom = (offset: number) => (((2 + offset) % 7) + 7) % 7;
const fmtLbl = (mesIdx: number, dia: number) =>
  `${String(dia).padStart(2, '0')}/${String(mesIdx).padStart(2, '0')}`;

function walk(totalDias: number, startOffset: number): { label: string; dow: number }[] {
  const out: { label: string; dow: number }[] = [];
  const dpm: Record<number, number> = { 7: 31, 8: 31, 9: 30, 10: 31, 11: 30 };
  let mes = REF_MES;
  let dia = REF_DIA + startOffset;
  while (dia < 1) {
    mes -= 1;
    dia += dpm[mes] ?? 30;
  }
  for (let i = 0; i < totalDias; i++) {
    out.push({ label: fmtLbl(mes, dia), dow: dowFrom(startOffset + i) });
    dia += 1;
    if (dia > (dpm[mes] ?? 30)) {
      dia = 1;
      mes += 1;
    }
  }
  return out;
}

const RECEITA_DIA_BASE = 58400 / 30;
const DESPESA_DIA_BASE = 53430 / 30;
const wobble = (i: number) => 1 + 0.05 * Math.sin(i * 1.7) + 0.03 * Math.cos(i * 0.6);

export function getProjecao(metric: Metric, horizonte: Horizonte): Projecao {
  const passado = 30;
  const dias = walk(passado + horizonte, -passado + 1);
  const step = horizonte <= 30 ? 2 : horizonte <= 60 ? 4 : 6;

  const diario = dias.map((d, i) => {
    const saz = PESOS[d.dow] * 7;
    const tendencia = 1 + 0.0015 * (i - passado);
    const receita = RECEITA_DIA_BASE * saz * tendencia * wobble(i);
    const despesa = DESPESA_DIA_BASE * (0.75 + 0.25 * saz) * wobble(i);
    const diaMes = Number(d.label.slice(0, 2));
    const fIdx = i - passado + 1;
    const vencimentos =
      i >= passado && diaMes >= 18 && diaMes <= 22 ? (fIdx <= 31 ? 4400 : 1500) : 0;
    return { ...d, receita, despesa, vencimentos, fIdx };
  });

  const mm = (arr: number[], i: number) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - 6); k <= i; k++) {
      s += arr[k];
      n++;
    }
    return s / n;
  };
  const receitas = diario.map((d) => d.receita);
  const lucros = diario.map((d) => d.receita - d.despesa);

  const pontos: PontoProjecao[] = [];
  let caixa = CAIXA_HOJE;
  for (let i = passado - 1; i >= 0; i--) caixa -= lucros[i];

  let minimo = Number.POSITIVE_INFINITY;
  let minimoLabel = '';
  let somaReceita = 0;
  let somaLucro = 0;
  let fim = 0;
  let fimLo = 0;
  let fimHi = 0;

  for (let i = 0; i < diario.length; i++) {
    const d = diario[i];
    const futuro = i >= passado;
    caixa += lucros[i] - d.vencimentos;
    if (futuro) {
      somaReceita += d.receita;
      somaLucro += lucros[i];
    }

    const valor =
      metric === 'caixa' ? caixa : metric === 'receita' ? mm(receitas, i) : mm(lucros, i);
    const base = Math.round(valor);

    if (!futuro) {
      const p: PontoProjecao = { label: d.label, real: base, previsto: null, faixa: null };
      if (i === passado - 1) {
        p.previsto = base;
        p.faixa = [base, base];
      }
      pontos.push(p);
      continue;
    }

    const inc = Math.min(0.18, 0.04 + 0.0035 * d.fIdx);
    const lo = Math.round(valor - Math.abs(valor) * inc);
    const hi = Math.round(valor + Math.abs(valor) * inc);

    if (metric === 'caixa' && base < minimo) {
      minimo = base;
      minimoLabel = d.label;
    }

    if (d.fIdx % step === 0 || d.fIdx === horizonte)
      pontos.push({ label: d.label, real: null, previsto: base, faixa: [lo, hi] });

    const total = metric === 'caixa' ? caixa : metric === 'receita' ? somaReceita : somaLucro;
    fim = Math.round(total);
    fimLo = Math.round(total - Math.abs(total) * inc);
    fimHi = Math.round(total + Math.abs(total) * inc);
  }

  const amostrado = pontos.filter(
    (p, idx) => p.previsto != null || idx % 3 === 0 || idx === passado - 1,
  );

  return {
    pontos: amostrado,
    fim,
    fimLo,
    fimHi,
    minimo: metric === 'caixa' ? minimo : 0,
    minimoLabel,
  };
}

function mk(
  nome: string,
  categoria: Categoria,
  qtdVendida: number,
  preco: number,
  custo: number,
): ItemCardapio {
  return {
    nome,
    categoria,
    qtdVendida,
    preco,
    custo,
    margem: preco - custo,
    margemPct: ((preco - custo) / preco) * 100,
  };
}

export const CARDAPIO: ItemCardapio[] = [
  mk('Frango Yangnyeom', 'Frango', 420, 64, 26),
  mk('Frango Soy Garlic', 'Frango', 356, 62, 25),
  mk('Frango Honey Butter', 'Frango', 188, 66, 31),
  mk('Frango ao Alho Crocante', 'Frango', 132, 60, 30),
  mk('Frango Cheese Powder', 'Frango', 74, 68, 38),
  mk('Batata Coreana', 'Acompanhamento', 310, 22, 8),
  mk('Tteokbokki', 'Acompanhamento', 164, 34, 15),
  mk('Kimchi da casa', 'Acompanhamento', 96, 18, 9),
  mk('Japchae', 'Acompanhamento', 58, 38, 22),
  mk('Cerveja long neck', 'Bebida', 148, 14, 4),
  mk('Soju', 'Bebida', 92, 28, 9),
  mk('Refrigerante lata', 'Bebida', 268, 8, 3),
  mk('Chá gelado de cevada', 'Bebida', 46, 12, 4),
  mk('Bingsu de morango', 'Sobremesa', 38, 32, 19),
];

export const MEDIA_QTD = CARDAPIO.reduce((s, i) => s + i.qtdVendida, 0) / CARDAPIO.length;
export const MEDIA_MARGEM_PCT = CARDAPIO.reduce((s, i) => s + i.margemPct, 0) / CARDAPIO.length;

export function quadranteDe(i: ItemCardapio): Quadrante {
  const pop = i.qtdVendida >= MEDIA_QTD;
  const mar = i.margemPct >= MEDIA_MARGEM_PCT;
  if (pop && mar) return 'estrela';
  if (pop && !mar) return 'cavalo';
  if (!pop && mar) return 'quebraCabeca';
  return 'repensar';
}

export const QUADRANTES: Record<Quadrante, QuadranteMeta> = {
  estrela: {
    emoji: '⭐',
    icon: 'star',
    label: 'Melhores',
    explicacao:
      'Vendem acima da média e a margem por unidade também está acima da média. Origem: quadrante «Stars» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Vendem muito e lucram bem. Proteja: mantenha qualidade e destaque no cardápio.',
    tone: 'mint',
  },
  cavalo: {
    emoji: '🐴',
    icon: 'local_fire_department',
    label: 'Populares',
    explicacao:
      'Vendem acima da média, mas a margem por unidade fica abaixo da média. Origem: quadrante «Plowhorses» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Vendem muito, mas sobra pouco. Vale ajustar preço ou baratear o custo.',
    tone: 'ocean',
  },
  quebraCabeca: {
    emoji: '🧩',
    icon: 'diamond',
    label: 'Promissores',
    explicacao:
      'A margem por unidade está acima da média, mas vendem abaixo da média. Origem: quadrante «Puzzles» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Lucram bem, mas vendem pouco. Divulgue e sugira na venda.',
    tone: 'warning',
  },
  repensar: {
    emoji: '🍍',
    icon: 'trending_down',
    label: 'Fracos',
    explicacao:
      'Vendem abaixo da média e a margem por unidade também. Origem: quadrante «Dogs» do menu engineering (Kasavana & Smith, 1982).',
    recomendacao: 'Vendem pouco e lucram pouco. Vale repensar receita, preço ou tirar do cardápio.',
    tone: 'neutral',
  },
};

export const POTENCIAL_BEBIDAS =
  Math.round(
    CARDAPIO.filter((i) => i.categoria === 'Bebida' && quadranteDe(i) === 'quebraCabeca').reduce(
      (s, i) => s + i.qtdVendida * 0.3 * i.margem,
      0,
    ) / 10,
  ) * 10;

function brl(n: number): string {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function gerarInsights(horizonte: Horizonte): Insight[] {
  const proj = getProjecao('caixa', horizonte);
  const lucro = getProjecao('lucro', horizonte);
  const out: Insight[] = [];

  if (proj.minimo < 3000) {
    out.push({
      id: 'caixa-apertado',
      severidade: proj.minimo < 1500 ? 'risco' : 'atencao',
      titulo: `Seu caixa deve ficar apertado por volta do dia ${proj.minimoLabel.slice(0, 2)}`,
      descricao: `A projeção mostra o saldo caindo para cerca de ${brl(proj.minimo)} em ${proj.minimoLabel}, por causa da concentração de vencimentos. Antecipar recebíveis ou negociar uma data ajuda a passar por essa semana com folga.`,
      acao: 'Ver fluxo de caixa',
      destino: '/fluxo-de-caixa',
      regra: 'Regra: saldo projetado mínimo abaixo de R$ 3.000 dentro do horizonte selecionado.',
      prioridade: 1,
    });
  }

  out.push({
    id: 'bebidas',
    severidade: 'oportunidade',
    titulo: `Bebidas têm sua melhor margem e vendem pouco — divulgar pode render +${brl(POTENCIAL_BEBIDAS)}/mês`,
    descricao:
      'Cerveja e soju lucram bem por unidade, mas aparecem em poucos pedidos. Sugerir a bebida no salão e criar combo com o frango costuma elevar o volume sem custo novo.',
    acao: 'Ver cardápio',
    destino: '/receitas',
    regra: 'Regra: item com margem acima da média e volume abaixo da média (quadrante Potencial).',
    prioridade: 3,
  });

  const impactoEmbalagem = Math.round((horizonte / 30) * 480);
  out.push({
    id: 'embalagens',
    severidade: 'atencao',
    titulo: 'O custo de embalagens vem subindo três meses seguidos',
    descricao: `A alta média é de 9% ao mês. Mantido o ritmo, isso come cerca de ${brl(impactoEmbalagem)} do seu resultado nos próximos ${horizonte} dias. Cotar outro fornecedor ou comprar em maior lote costuma reverter.`,
    acao: 'Ver custos',
    destino: '/custos',
    regra: 'Regra: subcategoria com alta acima de 5% em 3 meses consecutivos.',
    prioridade: 2,
  });

  out.push({
    id: 'fds',
    severidade: 'positivo',
    titulo: `O próximo fim de semana deve puxar cerca de ${brl(Math.round((SAZONALIDADE_SEMANAL[4].medio + SAZONALIDADE_SEMANAL[5].medio + SAZONALIDADE_SEMANAL[6].medio) / 10) * 10)}`,
    descricao:
      'Sexta, sábado e domingo à noite concentram a maior parte do faturamento. Vale reforçar o estoque de frango e a escala da cozinha antes de quinta.',
    acao: 'Ver receitas',
    destino: '/receitas',
    regra:
      'Regra: dias com peso acima de 15% do faturamento semanal na média das últimas 8 semanas.',
    prioridade: 4,
  });

  out.push({
    id: 'lucro',
    severidade: lucro.fim >= 5000 * (horizonte / 30) ? 'positivo' : 'atencao',
    titulo: `Lucro previsto de cerca de ${brl(lucro.fim)} em ${horizonte} dias`,
    descricao: `A faixa provável vai de ${brl(lucro.fimLo)} a ${brl(lucro.fimHi)}. A tendência dos últimos 6 meses é de alta leve, puxada pelo delivery — que também é o canal de menor margem.`,
    acao: 'Ver resultado',
    destino: '/resultado',
    regra: 'Regra: projeção de lucro comparada à média mensal dos últimos 3 meses.',
    prioridade: 5,
  });

  return out.sort((a, b) => a.prioridade - b.prioridade);
}

/* ---------------- Simulador "E se...?" ---------------- */

export interface Ajustes {
  preco: number;
  volume: number;
  custo: number;
}
export const AJUSTES_ZERO: Ajustes = { preco: 0, volume: 0, custo: 0 };

export const isDefault = (a: Ajustes): boolean => a.preco === 0 && a.volume === 0 && a.custo === 0;

export const SIM_BASE = {
  receita: 58400,
  custoVariavel: 27000,
  custoFixo: 21524,
  aliquotaImposto: 0.06,
};

export const REF = { pratosDia: 35, precoMedio: 38 };
export const PRATOS_MES = REF.pratosDia * 30;

export type LeverKey = 'volume' | 'preco' | 'custo' | 'cenario';
export type Cenario = 'fraco' | 'normal' | 'cheio';

export interface Alavancas {
  volume: number;
  preco: number;
  custo: number;
  cenario: Cenario;
}
export const ALAVANCAS_ZERO: Alavancas = {
  volume: 0,
  preco: REF.precoMedio,
  custo: 0,
  cenario: 'normal',
};

export const alavancaNoNormal = (a: Alavancas, k: LeverKey): boolean =>
  k === 'volume'
    ? a.volume === 0
    : k === 'preco'
      ? a.preco === REF.precoMedio
      : k === 'custo'
        ? a.custo === 0
        : a.cenario === 'normal';

export function ajustesDe(a: Alavancas, ativa: LeverKey): Ajustes {
  if (ativa === 'volume') {
    const deltaReceita = a.volume * REF.precoMedio * 30;
    return { ...AJUSTES_ZERO, volume: (deltaReceita / SIM_BASE.receita) * 100 };
  }
  if (ativa === 'preco') {
    const deltaReceita = (a.preco - REF.precoMedio) * PRATOS_MES;
    return { ...AJUSTES_ZERO, preco: (deltaReceita / SIM_BASE.receita) * 100 };
  }
  if (ativa === 'custo') {
    return { ...AJUSTES_ZERO, custo: (a.custo / SIM_BASE.custoVariavel) * 100 };
  }
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

const DPM_SIM: Record<number, number> = { 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30 };

function walkSim(totalDias: number, startOffset: number): { label: string; dow: number }[] {
  const out: { label: string; dow: number }[] = [];
  let mes = REF_MES;
  let dia = REF_DIA + startOffset;
  while (dia < 1) {
    mes -= 1;
    dia += DPM_SIM[mes] ?? 30;
  }
  for (let i = 0; i < totalDias; i++) {
    out.push({
      label: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`,
      dow: dowFrom(startOffset + i),
    });
    dia += 1;
    if (dia > (DPM_SIM[mes] ?? 30)) {
      dia = 1;
      mes += 1;
    }
  }
  return out;
}

const PASSADO_SIM = 30;

export function simular(ajustes: Ajustes, horizonte: Horizonte): Simulacao {
  const p = ajustes.preco / 100;
  const v = ajustes.volume / 100;
  const c = ajustes.custo / 100;
  const meses = horizonte / 30;

  const receita = SIM_BASE.receita * (1 + p) * (1 + v) * meses;
  const custoVariavel = SIM_BASE.custoVariavel * (1 + v) * (1 + c) * meses;
  const custoFixo = SIM_BASE.custoFixo * meses;
  const impostos = receita * SIM_BASE.aliquotaImposto;
  const lucro = receita - custoVariavel - custoFixo - impostos;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;

  const dias = walkSim(PASSADO_SIM + horizonte, -PASSADO_SIM + 1);
  const receitaDia = SIM_BASE.receita / 30;
  const varDia = SIM_BASE.custoVariavel / 30;
  const fixoDia = SIM_BASE.custoFixo / 30;

  const serie = dias.map((d, i) => {
    const saz = PESOS[d.dow] * 7;
    const tend = 1 + 0.0015 * (i - PASSADO_SIM);
    const w = wobble(i);
    const futuro = i >= PASSADO_SIM;
    const rec = receitaDia * saz * tend * w;
    const cv = varDia * saz * w;
    const diaMes = Number(d.label.slice(0, 2));
    const fIdx = i - PASSADO_SIM + 1;
    const vencimentos = futuro && diaMes >= 18 && diaMes <= 22 ? (fIdx <= 31 ? 4400 : 1500) : 0;

    const recSim = futuro ? rec * (1 + p) * (1 + v) : rec;
    const cvSim = futuro ? cv * (1 + v) * (1 + c) : cv;
    const lucroBase = rec - cv - fixoDia - rec * SIM_BASE.aliquotaImposto;
    const lucroSim = recSim - cvSim - fixoDia - recSim * SIM_BASE.aliquotaImposto;

    return { ...d, futuro, fIdx, vencimentos, lucroBase, lucroSim };
  });

  let caixaInicial = CAIXA_HOJE;
  for (let i = 0; i < PASSADO_SIM; i++) caixaInicial -= serie[i].lucroBase;

  const step = horizonte <= 30 ? 2 : horizonte <= 60 ? 4 : 6;
  let caixaSim = caixaInicial;
  let caixaBase = caixaInicial;
  let acumSim = 0;
  let acumBase = 0;
  let caixaMinimo = Number.POSITIVE_INFINITY;
  let caixaMinimoLabel = '';

  const mmWin: number[] = [];
  const mmWinBase: number[] = [];
  const media = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

  const pontos: SimPonto[] = [];
  const pontosLucro: SimPonto[] = [];

  for (let i = 0; i < serie.length; i++) {
    const d = serie[i];
    caixaSim += d.lucroSim - d.vencimentos;
    caixaBase += d.lucroBase - d.vencimentos;
    if (d.futuro) {
      acumSim += d.lucroSim;
      acumBase += d.lucroBase;
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
      ? i % 3 === 0 || i === PASSADO_SIM - 1
      : d.fIdx % step === 0 || d.fIdx === horizonte;
    if (!mostra) continue;

    const pushPonto = (arr: SimPonto[], sim: number, bse: number) => {
      if (!d.futuro) {
        const val = Math.round(sim);
        arr.push({
          label: d.label,
          real: val,
          previsto: i === PASSADO_SIM - 1 ? val : null,
          base: i === PASSADO_SIM - 1 ? val : null,
          faixa: i === PASSADO_SIM - 1 ? [val, val] : null,
        });
        return;
      }
      const val = Math.round(sim);
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

  const resultado: ResultadoSim = {
    receita,
    custoVariavel,
    custoFixo,
    impostos,
    lucro,
    margem,
    caixaFim: caixaSim,
    caixaMinimo: caixaMinimo === Number.POSITIVE_INFINITY ? caixaSim : caixaMinimo,
    caixaMinimoLabel,
  };

  return { resultado, pontos, pontosLucro, acumSim, acumBase };
}

@Injectable({ providedIn: 'root' })
export class PrevisoesService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly caixaHoje = signal(CAIXA_HOJE);
  readonly historico = signal<MesHist[]>([]);
  readonly loading = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Mesmo wrapper autenticado dos outros services (401 -> refresh + retry) — pronto pra quando o endpoint existir. */
  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (this.isUnauthorized(err)) {
        const refreshed = await this.auth.refresh();
        if (refreshed) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { response?: { status?: number } }).response?.status === 401
    );
  }

  /**
   * TODO(API): a camada preditiva não tem endpoint — os cálculos (getProjecao/simular/gerarInsights)
   * são feitos aqui no cliente. Só o saldo de caixa/histórico "vêm do servidor": por ora, mock local
   * no mesmo formato de resposta ({ payload }).
   */
  private async fetch(): Promise<{ payload: { caixaHoje: number; historico: MesHist[] } }> {
    await new Promise((r) => setTimeout(r, 380));
    return { payload: { caixaHoje: CAIXA_HOJE, historico: HISTORICO } };
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.call(() => this.fetch());
      this.caixaHoje.set(response.payload.caixaHoje);
      this.historico.set(response.payload.historico);
    } finally {
      this.loading.set(false);
    }
  }
}
