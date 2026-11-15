/**
 * Leitura tolerante de planilhas de movimentações (xlsx ou csv): acha as colunas pelo NOME do
 * cabeçalho (sem diferenciar caixa nem acento, com sinônimos) e traduz Tipo, Forma de pagamento e
 * Status para os valores do Mintly. O que a planilha não trouxer fica em branco para a pessoa
 * preencher na revisão.
 */
export type ImportField =
  | 'type'
  | 'title'
  | 'value'
  | 'date'
  | 'category'
  | 'account'
  | 'payment'
  | 'status'
  | 'notes';

/** Ordem das colunas do modelo baixado: usada quando o arquivo não tem cabeçalho reconhecível. */
export const TEMPLATE_ORDER: ImportField[] = [
  'type',
  'title',
  'value',
  'date',
  'category',
  'account',
  'payment',
  'status',
  'notes',
];

/** Minúsculas, sem acento, sem pontuação e com espaços únicos: "Cartão de Crédito" -> "cartao de credito". */
export function normalizeKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  type: ['tipo', 'natureza', 'entrada saida', 'tipo de movimentacao', 'movimento', 'direcao'],
  title: [
    'titulo',
    'descricao',
    'historico',
    'nome',
    'pedido',
    'produto',
    'item',
    'identificacao',
    'detalhe',
    'lancamento',
  ],
  value: [
    'valor',
    'valor bruto',
    'valor total',
    'total',
    'montante',
    'preco',
    'valor r',
    'valor do pedido',
    'valor liquido',
  ],
  date: [
    'data',
    'dia',
    'data da movimentacao',
    'data do pedido',
    'data de pagamento',
    'vencimento',
    'data de vencimento',
  ],
  category: ['categoria', 'classificacao', 'grupo'],
  account: ['conta', 'conta financeira', 'banco', 'carteira', 'origem', 'plataforma', 'canal'],
  payment: [
    'forma de pagamento',
    'forma pagamento',
    'pagamento',
    'meio de pagamento',
    'meio',
    'forma',
  ],
  status: ['status', 'situacao', 'estado'],
  notes: ['observacoes', 'observacao', 'obs', 'notas', 'anotacoes', 'comentarios'],
};

/**
 * Quais colunas existem e em que posição (0-based). Casa o cabeçalho inteiro ou o começo dele
 * ("Data (AAAA-MM-DD)" -> data). Primeiro nome de cada campo que aparecer vence.
 */
export function mapColumns(header: string[]): Partial<Record<ImportField, number>> {
  const found: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  const keys = header.map(normalizeKey);

  const tryField = (field: ImportField, exactOnly: boolean): void => {
    if (found[field] !== undefined) return;
    for (const alias of HEADER_ALIASES[field]) {
      const index = keys.findIndex(
        (k, i) =>
          !used.has(i) && k !== '' && (k === alias || (!exactOnly && k.startsWith(alias + ' '))),
      );
      if (index >= 0) {
        found[field] = index;
        used.add(index);
        return;
      }
    }
  };
  // Primeiro os nomes exatos de todos os campos; depois os que só começam igual.
  for (const field of TEMPLATE_ORDER) tryField(field, true);
  for (const field of TEMPLATE_ORDER) tryField(field, false);
  return found;
}

/** Colunas por posição (modelo do Mintly) quando o arquivo não tem cabeçalho reconhecível. */
export function templateColumns(): Partial<Record<ImportField, number>> {
  return Object.fromEntries(TEMPLATE_ORDER.map((f, i) => [f, i])) as Partial<
    Record<ImportField, number>
  >;
}

// ── CSV ──────────────────────────────────────────────────────────────────

/** UTF-8 (com ou sem BOM); se os bytes não forem UTF-8 válido, é o Windows-1252 do Excel brasileiro. */
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  let best = ';';
  let bestCount = -1;
  for (const d of [';', ',', '\t']) {
    // Conta só fora de aspas.
    let inQuotes = false;
    let count = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** CSV -> linhas de células. Aceita ; , ou tab, aspas com "" escapado e quebras de linha dentro de aspas. */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ── Tradução de valores ─────────────────────────────────────────────────

export type ImportMovType = 'income' | 'expense';
export type ImportMovStatus = 'received' | 'paid' | 'pending' | 'cancelled';

export function parseType(text: string): ImportMovType | null {
  const k = normalizeKey(text);
  if (['receita', 'entrada', 'credito', 'income', 'venda', 'recebimento', 'e', 'r'].includes(k)) {
    return 'income';
  }
  if (
    ['despesa', 'saida', 'debito', 'expense', 'custo', 'gasto', 'pagamento', 's', 'd'].includes(k)
  ) {
    return 'expense';
  }
  return null;
}

const PAYMENT_ALIASES: Record<string, string> = {
  dinheiro: 'Dinheiro',
  especie: 'Dinheiro',
  cash: 'Dinheiro',
  pix: 'PIX',
  debito: 'Débito',
  'cartao de debito': 'Débito',
  'cartao debito': 'Débito',
  credito: 'Crédito',
  'cartao de credito': 'Crédito',
  'cartao credito': 'Crédito',
  cartao: 'Crédito',
  transferencia: 'Transferência',
  ted: 'Transferência',
  doc: 'Transferência',
  boleto: 'Boleto',
  'carteira digital': 'Carteira Digital',
  carteira: 'Carteira Digital',
  'digital wallet': 'Carteira Digital',
};

/** "Pix", "pix", "Cartão de crédito", "Carteira digital"... -> a forma de pagamento do Mintly (ou null). */
export function parsePayment<T extends string>(text: string, methods: readonly T[]): T | null {
  const k = normalizeKey(text);
  if (!k) return null;
  const byAlias = PAYMENT_ALIASES[k];
  if (byAlias && methods.includes(byAlias as T)) return byAlias as T;
  return methods.find((m) => normalizeKey(m) === k) ?? null;
}

/** "Recebido", "pago", "concluído", "pendente", "cancelado"... Quem não diz o tipo fica sem status liquidado. */
export function parseStatus(text: string, type: ImportMovType | null): ImportMovStatus | null {
  const k = normalizeKey(text);
  if (!k) return null;
  if (['recebido', 'recebida'].includes(k)) return 'received';
  if (['pago', 'paga'].includes(k)) return 'paid';
  if (['pendente', 'aberto', 'aguardando', 'a receber', 'a pagar', 'previsto'].includes(k)) {
    return 'pending';
  }
  if (['cancelado', 'cancelada', 'estornado', 'recusado', 'cancelou'].includes(k))
    return 'cancelled';
  if (
    [
      'concluido',
      'concluida',
      'liquidado',
      'confirmado',
      'confirmada',
      'quitado',
      'entregue',
      'finalizado',
    ].includes(k)
  ) {
    if (type === 'income') return 'received';
    if (type === 'expense') return 'paid';
  }
  return null;
}

/** Casa um nome da planilha com um cadastro sem diferenciar caixa, acento nem pontuação. */
export function matchName<T extends { name: string }>(name: string, list: T[]): T | null {
  const k = normalizeKey(name);
  if (!k) return null;
  return list.find((item) => normalizeKey(item.name) === k) ?? null;
}

/** O mínimo de uma linha da importação que os avisos de erro do dono precisam. */
export interface LinhaParaAviso {
  row: number;
  type: ImportMovType | null;
  title: string;
  value: number;
  date: string;
  accountName: string;
}

/** Valor tantas vezes acima da mediana da planilha (do mesmo tipo) parece digitado em centavos. */
export const FATOR_VALOR_SUSPEITO = 20;
/** Abaixo disso nem olha (R$ 300 contra mediana de R$ 10 é normal num cardápio). */
export const VALOR_SUSPEITO_MINIMO = 1000;
/** Com menos linhas do mesmo tipo, a mediana não diz o que é "normal". */
export const LINHAS_PARA_MEDIANA = 5;

function mediana(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Erros comuns do dono na planilha (relatório Sweetie Bel, S3.10). Só avisa; não tira a linha:
 * - **linha repetida** na mesma planilha (mesmo tipo, título, valor, data e conta): pagamento ou Pix em dobro;
 * - **valor fora do normal**: 20× a mediana das linhas do mesmo tipo (e ≥ R$ 1.000) — "150000" que era R$ 1.500,00.
 * Devolve o aviso por índice da linha.
 */
export function avisosImportacao(linhas: LinhaParaAviso[]): Map<number, string> {
  const avisos = new Map<number, string>();
  const norm = (t: string) => normalizeKey(t);
  const vistas = new Map<string, number>();
  linhas.forEach((l, i) => {
    if (!l.type || !(l.value > 0) || !l.date) return;
    const chave = [l.type, norm(l.title), l.value.toFixed(2), l.date, norm(l.accountName)].join(
      '|',
    );
    const primeira = vistas.get(chave);
    if (primeira === undefined) vistas.set(chave, l.row);
    else
      avisos.set(
        i,
        `Igual à linha ${primeira - 1} desta planilha (mesmo título, valor, data e conta). Se foi pago uma vez só, desmarque esta.`,
      );
  });
  for (const tipo of ['income', 'expense'] as const) {
    const doTipo = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.type === tipo && l.value > 0);
    if (doTipo.length < LINHAS_PARA_MEDIANA) continue;
    const med = mediana(doTipo.map(({ l }) => l.value));
    for (const { l, i } of doTipo) {
      if (l.value < VALOR_SUSPEITO_MINIMO || l.value < med * FATOR_VALOR_SUSPEITO) continue;
      const texto = `Valor bem acima do normal desta planilha (a maioria fica perto de ${brl(med)}). Se veio em centavos, o certo seria ${brl(l.value / 100)}.`;
      avisos.set(i, avisos.has(i) ? `${avisos.get(i)} ${texto}` : texto);
    }
  }
  return avisos;
}
