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
