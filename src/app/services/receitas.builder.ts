/**
 * Receitas = lançamentos de entrada que já viraram dinheiro (Movimentações: receita recebida).
 * Aqui só há funções puras: recebem os lançamentos e devolvem o dataset que a tela consome.
 * Datas são "AAAA-MM-DD" (calendário, sem fuso).
 */

export type PeriodKey = 'Hoje' | '7 dias' | 'Este mês' | 'Mês passado' | 'Personalizado';
export type Canal = 'salao' | 'delivery';

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
}

export interface ItemReceita {
  nome: string;
  categoria: string;
  qtd: number;
  receita: number;
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
  sparks: {
    receitaBruta: number[];
    receitaLiquida: number[];
    ticketMedio: number[];
    pedidos: number[];
  };
  waterfall: { label: string; value: number; kind: 'start' | 'down' | 'end' }[];
  itens: ItemReceita[];
  porCategoria: { categoria: string; receita: number }[];
  canais: { canal: string; receita: number; liquida: number; nota: string }[];
  formasPagamento: { forma: string; valor: number }[];
  heatmap: { dia: string; faixa: string; valor: number }[] | null;
  heatmapMax: number;
  heatmapVazioMsg?: string;
  tendencia: { mes: string; total: number; salao: number; delivery: number }[];
  tendenciaDescricao: string;
  pedidosLabel: string;
}

export const FAIXAS = ['Manhã', 'Almoço', 'Tarde', 'Noite'] as const;
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
      pedidosLabel: 'Lançamentos hoje',
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
      pedidosLabel: 'Lançamentos em 7 dias',
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
      pedidosLabel: 'Lançamentos no mês',
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
      pedidosLabel: 'Lançamentos no período',
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
    pedidosLabel: 'Lançamentos no mês',
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
function totals(movs: ReceitaMov[], start: string, end: string): Totals {
  const sel = movs.filter((m) => within(m, start, end));
  const gross = money(sum(sel.map((m) => m.gross)));
  return {
    gross,
    net: money(sum(sel.map((m) => m.net))),
    count: sel.length,
    ticket: sel.length ? money(gross / sel.length) : 0,
  };
}

/** Variação sobre o período anterior; sem base de comparação (anterior = 0) mostra "—". */
function delta(atual: number, anterior: number): { text: string; up: boolean } {
  if (anterior === 0 && atual !== 0) return { text: '—', up: true };
  const p = anterior === 0 ? 0 : ((atual - anterior) / anterior) * 100;
  return { text: `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}%`, up: p >= 0 };
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

const formaLabel = (p: string) =>
  /^(débito|crédito)$/i.test(p) ? 'Cartão' : p === 'PIX' ? 'Pix' : p;

/**
 * @param taxRatio fração de imposto sobre a venda (0–1), vinda do DRE do mês; 0 quando o regime
 *   tributário ainda não foi configurado.
 */
export function buildReceitas(
  movs: ReceitaMov[],
  win: PeriodWindow,
  taxRatio: number,
): ReceitasDataset {
  const cur = totals(movs, win.start, win.end);
  const prev = totals(movs, win.prevStart, win.prevEnd);
  const sel = movs.filter((m) => within(m, win.start, win.end));

  const taxas = money(Math.max(0, cur.gross - cur.net));
  const impostos = money(cur.gross * taxRatio);
  const liquida = money(cur.gross - taxas - impostos);
  const liquidaPrev = money(
    prev.gross - Math.max(0, prev.gross - prev.net) - prev.gross * taxRatio,
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

  const canais = (['salao', 'delivery'] as const).map((canal) => {
    const doCanal = sel.filter((m) => m.canal === canal);
    const receita = money(sum(doCanal.map((m) => m.gross)));
    const net = sum(doCanal.map((m) => m.net));
    const taxaPct = receita > 0 ? Math.round(((receita - net) / receita) * 100) : 0;
    return {
      canal: canal === 'salao' ? 'Salão' : 'Delivery',
      receita,
      liquida: money(net - receita * taxRatio),
      nota:
        canal === 'salao'
          ? 'Sem taxas de marketplace'
          : taxaPct > 0
            ? `Após taxas da plataforma (~${taxaPct}%)`
            : 'Sem taxas registradas',
    };
  });

  // Tendência: meses (6) quando o período é mensal; senão dia a dia ou semana a semana.
  const tendencia: ReceitasDataset['tendencia'] = [];
  let tendenciaDescricao = '';
  const parte = (a: string, b: string, mes: string) => {
    const t = movs.filter((m) => within(m, a, b));
    const total = money(sum(t.map((m) => m.gross)));
    const salao = money(sum(t.filter((m) => m.canal === 'salao').map((m) => m.gross)));
    tendencia.push({ mes, total, salao, delivery: money(total - salao) });
  };
  if (win.trend === 'month') {
    const base = monthStart(win.end);
    for (let i = 5; i >= 0; i--) {
      const ms = addMonths(base, -i);
      parte(ms, monthEnd(ms), MESES[Number(ms.slice(5, 7)) - 1].slice(0, 3));
    }
    tendenciaDescricao = 'Últimos 6 meses';
  } else if (win.trend === 'day') {
    const dias = diffDays(win.start, win.end) + 1;
    for (let i = 0; i < dias; i++) {
      const d = addDays(win.start, i);
      parte(d, d, `${d.slice(8, 10)}/${d.slice(5, 7)}`);
    }
    tendenciaDescricao = 'Dia a dia no período';
  } else {
    buckets(win.start, win.end).forEach(([a, b], i) => parte(a, b, `Sem ${i + 1}`));
    tendenciaDescricao = 'Semana a semana no período';
  }

  const itens = porGrupo(sel, (m) => `${m.item}\u0000${m.category}` as string).map((g) => {
    const [nome, categoria] = g.chave.split('\u0000');
    return { nome, categoria, qtd: g.qtd, receita: g.receita };
  });
  const porCategoriaTodas = porGrupo(sel, (m) => m.category);
  const porCategoria = porCategoriaTodas.slice(0, 5).map((g) => ({
    categoria: g.chave,
    receita: g.receita,
  }));
  const resto = money(sum(porCategoriaTodas.slice(5).map((g) => g.receita)));
  if (resto > 0) porCategoria.push({ categoria: 'Outras', receita: resto });

  const pagamentos = new Map<string, number>();
  for (const m of sel)
    pagamentos.set(formaLabel(m.payment), (pagamentos.get(formaLabel(m.payment)) ?? 0) + m.gross);

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
    porCategoria,
    canais,
    formasPagamento: [...pagamentos.entries()]
      .map(([forma, valor]) => ({ forma, valor: money(valor) }))
      .sort((a, b) => b.valor - a.valor),
    heatmap: null,
    heatmapMax: 0,
    heatmapVazioMsg:
      'O padrão por dia da semana e horário aparece quando os lançamentos tiverem horário de venda.',
    tendencia,
    tendenciaDescricao,
    pedidosLabel: win.pedidosLabel,
  };
}

/** Data de hoje no calendário local. */
export const hoje = () => isoDate(new Date());
