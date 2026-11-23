/**
 * Receitas = lançamentos de entrada que já viraram dinheiro (Movimentações: receita recebida).
 * Aqui só há funções puras: recebem os lançamentos e devolvem o dataset que a tela consome.
 * Datas são "AAAA-MM-DD" (calendário, sem fuso).
 */
import { shortDateRange } from '../shared/format';
import { porDiaDaSemana, porDiaDoMes, porHora, porMesDoAno } from './receitas-quando';
import { ImpostoMes, impostoFixoNaJanela } from '../shared/imposto-mes';
import { Sazonalidade, sazonalidadePorCanal } from './receitas-sazonalidade';

export type PeriodKey = 'Hoje' | '7 dias' | 'Este mês' | 'Mês passado' | 'Personalizado';
export type Canal = 'salao' | 'delivery' | 'encomendas';

/** Entrada já recebida, na forma que o cálculo precisa. */
export interface ReceitaMov {
  /** Quando o dinheiro entrou (settledAt ?? vencimento ?? data do lançamento). */
  date: string;
  gross: number;
  /** Bruto menos taxas de plataforma. */
  net: number;
  /** Subitem da categoria ou, na falta, o título do lançamento. */
  item: string;
  category: string;
  canal: Canal;
  /** Forma de pagamento como o usuário escolheu (Pix, Débito, Crédito…). */
  payment: string;
  /** Pratos vendidos nesta entrada (cópia do cardápio no dia). Ausente: a venda não informou os pratos. */
  pratos?: { menuItemId: string; name: string; qty: number; unitPrice: number }[];
  /** Dia da venda ("AAAA-MM-DD"), que pode ser antes do dinheiro entrar. Base do dia da semana no mapa. */
  saleDate?: string;
  /** Hora da venda ("HH:MM"). Ausente: fechamento do dia ou venda sem hora (fica fora do mapa). */
  saleTime?: string;
  /** Quantas vendas a entrada soma (fechamento do dia). Ausente = 1. */
  salesCount?: number;
}

export interface ItemReceita {
  nome: string;
  categoria: string;
  qtd: number;
  receita: number;
  /** (preço − custo atual do prato) × quantidade. `null`: o prato não tem custo no cardápio (P.9). */
  lucro: number | null;
}

export interface ReceitasDataset {
  key: string;
  refLabel: string;
  comparacaoLabel: string;
  receitaBruta: number;
  taxas: number;
  impostos: number;
  receitaLiquida: number;
  pedidos: number;
  ticketMedio: number;
  deltas: { receitaBruta: string; receitaLiquida: string; ticketMedio: string; pedidos: string };
  deltasUp: {
    receitaBruta: boolean;
    receitaLiquida: boolean;
    ticketMedio: boolean;
    pedidos: boolean;
  };
  /** Sem alteração em relação ao período anterior: o card mostra neutro. */
  deltasFlat: {
    receitaBruta: boolean;
    receitaLiquida: boolean;
    ticketMedio: boolean;
    pedidos: boolean;
  };
  sparks: {
    receitaBruta: number[];
    receitaLiquida: number[];
    ticketMedio: number[];
    pedidos: number[];
  };
  waterfall: { label: string; value: number; kind: 'start' | 'down' | 'end' }[];
  /** Ranking de pratos: só entram vendas que informaram os pratos (preço do prato × quantidade). */
  itens: ItemReceita[];
  /** Vendas do período sem pratos informados: ficam fora do ranking de itens. */
  semPratos: number;
  porCategoria: { categoria: string; receita: number }[];
  canais: { canal: string; receita: number; liquida: number; nota: string }[];
  /** Volume e quanto cada forma custa em taxa (P.9: "vale incentivar o Pix?"). */
  formasPagamento: { forma: string; valor: number; taxaPct: number; rotulo: string }[];
  heatmap: { dia: string; faixa: string; valor: number }[] | null;
  heatmapMax: number;
  heatmapVazioMsg?: string;
  /** P.7: "Quando você mais vende" por hora, dia da semana, dia do mês e mês do ano. */
  quando: {
    hora: { pontos: { hora: string; valor: number }[]; semHora: number };
    semana: { dia: string; valor: number; indice: number }[];
    mes: { dia: string; valor: number }[];
    ano: { mes: string; valor: number; anoAnterior: number }[];
  };
  /** Quantas vendas do período entraram no mapa (têm hora), ex.: "12 de 40 vendas com hora informada". */
  heatmapCobertura?: string;
  /** Alguma entrada (em qualquer período) é encomenda: a tela mostra o canal. */
  temEncomendas: boolean;
  /** P.2: os 12 meses até o fim do período, por canal, com o índice sazonal. */
  sazonalidade: Sazonalidade;
  /** Na visão por mês (12 meses): `anoAnterior` = mesmo mês do ano anterior e `media3` = média dos últimos 3 meses. */
  tendencia: {
    mes: string;
    total: number;
    salao: number;
    delivery: number;
    encomendas: number;
    anoAnterior?: number;
    media3?: number;
  }[];
  tendenciaDescricao: string;
  pedidosLabel: string;
}

export const FAIXAS = ['Manhã', 'Almoço', 'Tarde', 'Noite'] as const;
export type Faixa = (typeof FAIXAS)[number];

/** Faixa do dia pela hora da venda: manhã até 10:59, almoço 11:00–14:59, tarde 15:00–17:59, noite depois. */
export function faixaDaHora(hhmm: string): Faixa {
  const h = Number(hhmm.slice(0, 2));
  if (h < 11) return 'Manhã';
  if (h < 15) return 'Almoço';
  if (h < 18) return 'Tarde';
  return 'Noite';
}

/** Vendas que a entrada soma (ausente = 1). */
const vendas = (m: ReceitaMov) => m.salesCount ?? 1;
export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

// ── datas de calendário ─────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const diffDays = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
const addMonths = (s: string, n: number) => {
  const d = parse(monthStart(s));
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
};
const monthEnd = (s: string) => {
  const d = parse(monthStart(s));
  return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const fmtDia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const monthLabel = (s: string) => `${MESES[Number(s.slice(5, 7)) - 1]}/${s.slice(0, 4)}`;
const money = (n: number) => Math.round(n * 100) / 100;

// ── janela do período e do período de comparação ────────────────────────
export interface PeriodWindow {
  key: string;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  refLabel: string;
  comparacaoLabel: string;
  pedidosLabel: string;
  trend: 'month' | 'day' | 'week';
}

export function resolveWindow(
  period: PeriodKey,
  from: string | undefined,
  to: string | undefined,
  today: string,
): PeriodWindow {
  if (period === 'Hoje') {
    const prev = addDays(today, -1);
    return {
      key: 'hoje',
      start: today,
      end: today,
      prevStart: prev,
      prevEnd: prev,
      refLabel: `Hoje, ${fmtDia(today).slice(0, 5)}`,
      comparacaoLabel: 'vs. ontem',
      pedidosLabel: 'Vendas hoje',
      trend: 'day',
    };
  }
  if (period === '7 dias') {
    const start = addDays(today, -6);
    return {
      key: '7d',
      start,
      end: today,
      prevStart: addDays(start, -7),
      prevEnd: addDays(start, -1),
      refLabel: `${fmtDia(start)} – ${fmtDia(today)}`,
      comparacaoLabel: 'vs. 7 dias anteriores',
      pedidosLabel: 'Vendas em 7 dias',
      trend: 'day',
    };
  }
  if (period === 'Mês passado') {
    const start = addMonths(today, -1);
    const prevStart = addMonths(start, -1);
    return {
      key: 'mes-passado',
      start,
      end: monthEnd(start),
      prevStart,
      prevEnd: monthEnd(prevStart),
      refLabel: monthLabel(start),
      comparacaoLabel: 'vs. mês retrasado',
      pedidosLabel: 'Vendas no mês',
      trend: 'month',
    };
  }
  if (period === 'Personalizado' && from && to && from <= to) {
    const dias = diffDays(from, to) + 1;
    return {
      key: `custom-${from}-${to}`,
      start: from,
      end: to,
      prevStart: addDays(from, -dias),
      prevEnd: addDays(from, -1),
      refLabel: `${fmtDia(from)} – ${fmtDia(to)}`,
      comparacaoLabel: 'vs. período anterior equivalente',
      pedidosLabel: 'Vendas no período',
      trend: dias <= 14 ? 'day' : 'week',
    };
  }
  // Este mês (padrão): do dia 1 até hoje, contra o mesmo trecho do mês anterior.
  const start = monthStart(today);
  const prevStart = addMonths(start, -1);
  const diaDoMes = Number(today.slice(8, 10));
  const prevEndCap = addDays(prevStart, diaDoMes - 1);
  const prevMonthEnd = monthEnd(prevStart);
  return {
    key: 'este-mes',
    start,
    end: today,
    prevStart,
    prevEnd: prevEndCap > prevMonthEnd ? prevMonthEnd : prevEndCap,
    refLabel: monthLabel(start),
    comparacaoLabel: 'vs. mesmo período do mês anterior',
    pedidosLabel: 'Vendas no mês',
    trend: 'month',
  };
}

// ── agregações ──────────────────────────────────────────────────────────
const within = (m: ReceitaMov, start: string, end: string) => m.date >= start && m.date <= end;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

interface Totals {
  gross: number;
  net: number;
  count: number;
  ticket: number;
}
/** `count` = número de vendas (o fechamento do dia soma várias); ticket = receita ÷ vendas. */
function totals(movs: ReceitaMov[], start: string, end: string): Totals {
  const sel = movs.filter((m) => within(m, start, end));
  const gross = money(sum(sel.map((m) => m.gross)));
  const count = sum(sel.map(vendas));
  return {
    gross,
    net: money(sum(sel.map((m) => m.net))),
    count,
    ticket: count ? money(gross / count) : 0,
  };
}

const NOME_CANAL: Record<Canal, string> = {
  salao: 'Salão',
  delivery: 'Delivery',
  encomendas: 'Encomendas',
};

/**
 * Mapa dia da semana × faixa do dia: soma das vendas COM hora no período. O dia da semana é o da venda
 * (não o do repasse). Sem nenhuma venda com hora, devolve `null` e a tela explica como preencher.
 */
function mapaDeVendas(sel: ReceitaMov[]): {
  heatmap: ReceitasDataset['heatmap'];
  max: number;
  cobertura?: string;
} {
  const comHora = sel.filter((m) => m.saleTime);
  if (comHora.length === 0) return { heatmap: null, max: 0 };
  const cel = new Map<string, number>();
  for (const m of comHora) {
    const dia = DIAS_SEMANA[(parse(m.saleDate ?? m.date).getDay() + 6) % 7];
    const k = `${dia}|${faixaDaHora(m.saleTime!)}`;
    cel.set(k, (cel.get(k) ?? 0) + m.gross);
  }
  const heatmap = DIAS_SEMANA.flatMap((dia) =>
    FAIXAS.map((faixa) => ({ dia, faixa, valor: money(cel.get(`${dia}|${faixa}`) ?? 0) })),
  );
  const totalVendas = sum(sel.map(vendas));
  const vendasComHora = sum(comHora.map(vendas));
  return {
    heatmap,
    max: Math.max(...heatmap.map((h) => h.valor)),
    cobertura:
      vendasComHora < totalVendas
        ? `${vendasComHora.toLocaleString('pt-BR')} de ${totalVendas.toLocaleString('pt-BR')} vendas do período têm hora informada.`
        : undefined,
  };
}

/**
 * Variação sobre o período anterior. Sem base de comparação (anterior = 0) devolve "—" e o card não
 * mostra a linha; sem alteração devolve `flat` (neutro).
 */
function delta(atual: number, anterior: number): { text: string; up: boolean; flat: boolean } {
  if (anterior === 0) return { text: '—', up: false, flat: false };
  const p = ((atual - anterior) / anterior) * 100;
  if (Math.abs(p) < 0.05) return { text: '0%', up: false, flat: true };
  return {
    text: `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}%`,
    up: p >= 0,
    flat: false,
  };
}

/** Divide [start, end] em até 6 trechos de dias consecutivos (para os mini-gráficos dos cards). */
function buckets(start: string, end: string): [string, string][] {
  const dias = diffDays(start, end) + 1;
  const n = Math.min(6, dias);
  const out: [string, string][] = [];
  for (let i = 0; i < n; i++) {
    const a = addDays(start, Math.floor((i * dias) / n));
    const b = i === n - 1 ? end : addDays(start, Math.floor(((i + 1) * dias) / n) - 1);
    out.push([a, b]);
  }
  return out;
}

const pontos = (xs: number[]) => (xs.length === 1 ? [xs[0], xs[0]] : xs);

function porGrupo<T extends string>(
  movs: ReceitaMov[],
  chave: (m: ReceitaMov) => T,
): { chave: T; receita: number; qtd: number }[] {
  const map = new Map<T, { receita: number; qtd: number }>();
  for (const m of movs) {
    const k = chave(m);
    const cur = map.get(k) ?? { receita: 0, qtd: 0 };
    cur.receita += m.gross;
    cur.qtd += 1;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([chave, v]) => ({ chave, receita: money(v.receita), qtd: v.qtd }))
    .sort((a, b) => b.receita - a.receita);
}

const formaLabel = (p: string) => (p === 'PIX' ? 'Pix' : p);

/**
 * @param imposto fração de imposto sobre a venda (0–1, Simples; 0 sem regime) ou o imposto do mês do Resultado
 *   (`ImpostoMes`: no MEI, o DAS fixo, repartido entre canais e dias pela receita).
 * @param custos custo unitário atual de cada prato do cardápio (id → R$). Prato sem custo (0 ou ausente) fica
 *   sem lucro no ranking.
 */
export function buildReceitas(
  movs: ReceitaMov[],
  win: PeriodWindow,
  imposto: number | ImpostoMes,
  custos: ReadonlyMap<string, number> = new Map(),
): ReceitasDataset {
  const cur = totals(movs, win.start, win.end);
  const prev = totals(movs, win.prevStart, win.prevEnd);
  // T1: no MEI o DAS é fixo no período; vira uma fração só para repartir entre canais e dias (como a série da API).
  const imp: ImpostoMes = typeof imposto === 'number' ? { aliquota: imposto, fixoMes: 0 } : imposto;
  const fixoCur = impostoFixoNaJanela(imp.fixoMes, win.start, win.end);
  const fixoPrev = impostoFixoNaJanela(imp.fixoMes, win.prevStart, win.prevEnd);
  const taxRatio = imp.aliquota + (cur.gross > 0 ? fixoCur / cur.gross : 0);
  const taxRatioPrev = imp.aliquota + (prev.gross > 0 ? fixoPrev / prev.gross : 0);
  const sel = movs.filter((m) => within(m, win.start, win.end));

  const taxas = money(Math.max(0, cur.gross - cur.net));
  const impostos = money(cur.gross * taxRatio);
  const liquida = money(cur.gross - taxas - impostos);
  const liquidaPrev = money(
    prev.gross - Math.max(0, prev.gross - prev.net) - prev.gross * taxRatioPrev,
  );

  const dB = delta(cur.gross, prev.gross);
  const dL = delta(liquida, liquidaPrev);
  const dT = delta(cur.ticket, prev.ticket);
  const dP = delta(cur.count, prev.count);

  const sparks = buckets(win.start, win.end).map(([a, b]) => {
    const t = totals(movs, a, b);
    return {
      gross: t.gross,
      liq: money(t.net - t.gross * taxRatio),
      ticket: t.ticket,
      count: t.count,
    };
  });

  // Encomendas só aparece para quem já lançou alguma (em qualquer período), para não poluir quem não tem.
  const temEncomendas = movs.some((m) => m.canal === 'encomendas');
  const listaCanais: Canal[] = temEncomendas
    ? ['salao', 'delivery', 'encomendas']
    : ['salao', 'delivery'];
  const canais = listaCanais.map((canal) => {
    const doCanal = sel.filter((m) => m.canal === canal);
    const receita = money(sum(doCanal.map((m) => m.gross)));
    const net = sum(doCanal.map((m) => m.net));
    const taxaPct = receita > 0 ? Math.round(((receita - net) / receita) * 100) : 0;
    return {
      canal: NOME_CANAL[canal],
      receita,
      liquida: money(net - receita * taxRatio),
      nota:
        canal === 'salao'
          ? 'Sem taxas de marketplace'
          : taxaPct > 0
            ? canal === 'delivery'
              ? `Após taxas da plataforma (~${taxaPct}%)`
              : `Após taxas (~${taxaPct}%)`
            : 'Sem taxas registradas',
    };
  });

  // Tendência: meses (6) quando o período é mensal; senão dia a dia ou semana a semana.
  const tendencia: ReceitasDataset['tendencia'] = [];
  let tendenciaDescricao = '';
  const parte = (a: string, b: string, mes: string) => {
    const t = movs.filter((m) => within(m, a, b));
    const total = money(sum(t.map((m) => m.gross)));
    const doCanal = (c: Canal) => money(sum(t.filter((m) => m.canal === c).map((m) => m.gross)));
    const salao = doCanal('salao');
    const encomendas = doCanal('encomendas');
    tendencia.push({ mes, total, salao, encomendas, delivery: money(total - salao - encomendas) });
  };
  if (win.trend === 'month') {
    // P.9: 12 meses, com o mesmo mês do ano anterior e a média móvel de 3 meses.
    const base = monthStart(win.end);
    const totalDoMes = (ms: string) =>
      money(sum(movs.filter((m) => within(m, ms, monthEnd(ms))).map((m) => m.gross)));
    for (let i = 11; i >= 0; i--) {
      const ms = addMonths(base, -i);
      parte(ms, monthEnd(ms), MESES[Number(ms.slice(5, 7)) - 1].slice(0, 3));
      const ponto = tendencia[tendencia.length - 1];
      ponto.anoAnterior = totalDoMes(addMonths(ms, -12));
      ponto.media3 = money(
        (totalDoMes(ms) + totalDoMes(addMonths(ms, -1)) + totalDoMes(addMonths(ms, -2))) / 3,
      );
    }
    tendenciaDescricao = 'Últimos 12 meses, com o ano anterior e a média de 3 meses';
  } else if (win.trend === 'day') {
    const dias = diffDays(win.start, win.end) + 1;
    for (let i = 0; i < dias; i++) {
      const d = addDays(win.start, i);
      parte(d, d, `${d.slice(8, 10)}/${d.slice(5, 7)}`);
    }
    tendenciaDescricao = 'Dia a dia no período';
  } else {
    buckets(win.start, win.end).forEach(([a, b]) => parte(a, b, shortDateRange(a, b)));
    tendenciaDescricao = 'Semana a semana no período';
  }

  // Ranking de pratos: cada prato vale o PREÇO DELE × a quantidade (isolado, sem dividir o total do
  // pedido). Venda sem pratos informados não entra: o título do pedido não é um prato.
  const porPrato = new Map<string, ItemReceita>();
  for (const m of sel) {
    for (const p of m.pratos ?? []) {
      const custo = custos.get(p.menuItemId) ?? 0;
      const cur = porPrato.get(p.menuItemId) ?? {
        nome: p.name,
        categoria: m.category,
        qtd: 0,
        receita: 0,
        lucro: custo > 0 ? 0 : null,
      };
      cur.qtd += p.qty;
      cur.receita = money(cur.receita + p.qty * p.unitPrice);
      if (cur.lucro !== null) cur.lucro = money(cur.lucro + p.qty * (p.unitPrice - custo));
      porPrato.set(p.menuItemId, cur);
    }
  }
  const itens = [...porPrato.values()].sort((a, b) => b.receita - a.receita);
  const semPratos = sel.filter((m) => !m.pratos?.length).length;
  const porCategoriaTodas = porGrupo(sel, (m) => m.category);
  const porCategoria = porCategoriaTodas.slice(0, 5).map((g) => ({
    categoria: g.chave,
    receita: g.receita,
  }));
  const resto = money(sum(porCategoriaTodas.slice(5).map((g) => g.receita)));
  if (resto > 0) porCategoria.push({ categoria: 'Outras', receita: resto });

  const mapa = mapaDeVendas(sel);

  // P.9: débito e crédito separados, cada forma com o quanto custa em taxa.
  const pagamentos = new Map<string, { gross: number; net: number }>();
  for (const m of sel) {
    const forma = formaLabel(m.payment);
    const cur = pagamentos.get(forma) ?? { gross: 0, net: 0 };
    cur.gross += m.gross;
    cur.net += m.net;
    pagamentos.set(forma, cur);
  }

  return {
    key: win.key,
    refLabel: win.refLabel,
    comparacaoLabel: win.comparacaoLabel,
    receitaBruta: cur.gross,
    taxas,
    impostos,
    receitaLiquida: liquida,
    pedidos: cur.count,
    ticketMedio: cur.ticket,
    deltas: {
      receitaBruta: dB.text,
      receitaLiquida: dL.text,
      ticketMedio: dT.text,
      pedidos: dP.text,
    },
    deltasUp: { receitaBruta: dB.up, receitaLiquida: dL.up, ticketMedio: dT.up, pedidos: dP.up },
    deltasFlat: {
      receitaBruta: dB.flat,
      receitaLiquida: dL.flat,
      ticketMedio: dT.flat,
      pedidos: dP.flat,
    },
    sparks: {
      receitaBruta: pontos(sparks.map((s) => s.gross)),
      receitaLiquida: pontos(sparks.map((s) => s.liq)),
      ticketMedio: pontos(sparks.map((s) => s.ticket)),
      pedidos: pontos(sparks.map((s) => s.count)),
    },
    waterfall: [
      { label: 'Receita bruta', value: cur.gross, kind: 'start' },
      ...(taxas > 0 ? [{ label: 'Taxas', value: -taxas, kind: 'down' as const }] : []),
      { label: 'Impostos s/ venda', value: -impostos, kind: 'down' },
      { label: 'Receita líquida', value: liquida, kind: 'end' },
    ],
    itens,
    semPratos,
    porCategoria,
    canais,
    formasPagamento: [...pagamentos.entries()]
      .map(([forma, v]) => {
        const taxaPct = v.gross > 0 ? Math.round(((v.gross - v.net) / v.gross) * 1000) / 10 : 0;
        return {
          forma,
          valor: money(v.gross),
          taxaPct,
          rotulo: `${forma} · ${String(taxaPct).replace('.', ',')}%`,
        };
      })
      .sort((a, b) => b.valor - a.valor),
    quando: {
      hora: porHora(sel),
      semana: porDiaDaSemana(sel),
      mes: porDiaDoMes(sel),
      ano: porMesDoAno(movs, win.end),
    },
    heatmap: mapa.heatmap,
    heatmapMax: mapa.max,
    heatmapVazioMsg:
      'Preencha a hora da venda nos lançamentos (campo "Hora da venda") para ver em que dia e horário você mais vende.',
    heatmapCobertura: mapa.cobertura,
    temEncomendas,
    sazonalidade: sazonalidadePorCanal(movs, win.end),
    tendencia,
    tendenciaDescricao,
    pedidosLabel: win.pedidosLabel,
  };
}

/** Data de hoje no calendário local. */
export const hoje = () => isoDate(new Date());
