import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Workbook } from 'exceljs';
import {
  IMPORT_MOVEMENTS_MAX_ROWS,
  MovementDirection,
  MovementStatus,
  MovementChannel,
  PaymentMethod as LibPaymentMethod,
} from 'mintly-lib';
import type {
  FinancialMovement,
  Headers,
  ImportMovementRow,
  RegisterMovementRequest,
  UpdateMovementRequest,
} from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';
import mockMovements from '../mocks/mock_movements.json';

export type MovType = 'income' | 'expense';
export type MovStatus = 'received' | 'paid' | 'pending' | 'cancelled';
export type Channel = 'dineIn' | 'delivery' | 'shared';
export type PaymentMethod =
  | 'Dinheiro'
  | 'PIX'
  | 'Débito'
  | 'Crédito'
  | 'Transferência'
  | 'Boleto'
  | 'Carteira Digital';

export interface Movement {
  id: string;
  title: string;
  type: MovType;
  status: MovStatus;
  date: string; // YYYY-MM-DD
  /** Vencimento (fatia 1) — null = à vista (nasce liquidado). */
  dueDate: string | null;
  /** Quando o dinheiro de fato mexeu (fatia 2) — leitura: settledAt ?? dueDate ?? date. */
  settledAt: string | null;
  value: number;
  /** Valor líquido (bruto menos taxa de plataforma). Ausente nos dados antigos/mock: vale o bruto. */
  net?: number;
  categoryId: string | null;
  /** Subitem da categoria (fatia 5) — precisa ser da categoria escolhida e estar ativa. */
  subcategoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  /** Canal (fatia 5) — ausente: usa o canal efetivo nos relatórios. */
  channel: Channel | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  'Dinheiro',
  'PIX',
  'Débito',
  'Crédito',
  'Transferência',
  'Boleto',
  'Carteira Digital',
];

export const STATUS_META: Record<
  MovStatus,
  {
    label: string;
    tone: 'neutral' | 'mint' | 'ocean' | 'success' | 'warning' | 'error';
    icon: string;
  }
> = {
  received: { label: 'Recebido', tone: 'success', icon: 'check_circle' },
  paid: { label: 'Pago', tone: 'success', icon: 'check_circle' },
  pending: { label: 'Pendente', tone: 'warning', icon: 'schedule' },
  cancelled: { label: 'Cancelado', tone: 'neutral', icon: 'cancel' },
};

const DIRECTION_TO_LIB: Record<MovType, MovementDirection> = {
  income: MovementDirection.In,
  expense: MovementDirection.Out,
};
const DIRECTION_FROM_LIB: Record<MovementDirection, MovType> = {
  [MovementDirection.In]: 'income',
  [MovementDirection.Out]: 'expense',
};

const CHANNEL_TO_LIB: Record<Channel, MovementChannel> = {
  dineIn: MovementChannel.DineIn,
  delivery: MovementChannel.Delivery,
  shared: MovementChannel.Shared,
};
const CHANNEL_FROM_LIB: Record<MovementChannel, Channel> = {
  [MovementChannel.DineIn]: 'dineIn',
  [MovementChannel.Delivery]: 'delivery',
  [MovementChannel.Shared]: 'shared',
};

const PAYMENT_TO_LIB: Record<PaymentMethod, LibPaymentMethod> = {
  Dinheiro: LibPaymentMethod.Cash,
  PIX: LibPaymentMethod.Pix,
  Débito: LibPaymentMethod.Debit,
  Crédito: LibPaymentMethod.Credit,
  Transferência: LibPaymentMethod.Transfer,
  Boleto: LibPaymentMethod.Boleto,
  'Carteira Digital': LibPaymentMethod.DigitalWallet,
};
const PAYMENT_FROM_LIB: Record<LibPaymentMethod, PaymentMethod> = {
  [LibPaymentMethod.Cash]: 'Dinheiro',
  [LibPaymentMethod.Pix]: 'PIX',
  [LibPaymentMethod.Debit]: 'Débito',
  [LibPaymentMethod.Credit]: 'Crédito',
  [LibPaymentMethod.Transfer]: 'Transferência',
  [LibPaymentMethod.Boleto]: 'Boleto',
  [LibPaymentMethod.DigitalWallet]: 'Carteira Digital',
};

/** 'received'/'paid' são o mesmo MovementStatus.Settled — a direção decide o rótulo. */
function toMovStatus(direction: MovementDirection, status: MovementStatus): MovStatus {
  if (status === MovementStatus.Pending) return 'pending';
  if (status === MovementStatus.Cancelled) return 'cancelled';
  return direction === MovementDirection.In ? 'received' : 'paid';
}
function fromMovStatus(status: MovStatus): MovementStatus {
  if (status === 'pending') return MovementStatus.Pending;
  if (status === 'cancelled') return MovementStatus.Cancelled;
  return MovementStatus.Settled;
}

function toISODate(value: unknown): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
function toISODateOrNull(value: unknown): string | null {
  if (!value) return null;
  return toISODate(value);
}
function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Converte a entity da lib (FinancialMovement, com account/category/subcategory como Extended Reference) pro shape da tela. */
function toMovement(raw: FinancialMovement): Movement {
  const r = raw as unknown as {
    _id?: string;
    id?: string;
    title: string;
    direction: MovementDirection;
    status: MovementStatus;
    date: unknown;
    dueDate?: unknown;
    settledAt?: unknown;
    grossValue: number;
    netValue?: number;
    account?: { _id: string };
    category?: { _id: string };
    subcategory?: { _id: string };
    channel?: MovementChannel;
    paymentMethod: LibPaymentMethod;
    description?: string;
    audit?: { createdAt?: unknown; updatedAt?: unknown; createdBy?: string; updatedBy?: string };
  };
  return {
    id: (r._id ?? r.id) as string,
    title: r.title,
    type: DIRECTION_FROM_LIB[r.direction],
    status: toMovStatus(r.direction, r.status),
    date: toISODate(r.date),
    dueDate: toISODateOrNull(r.dueDate),
    settledAt: toISODateOrNull(r.settledAt),
    value: r.grossValue,
    net: r.netValue ?? r.grossValue,
    categoryId: r.category?._id ?? null,
    subcategoryId: r.subcategory?._id ?? null,
    accountId: r.account?._id ?? null,
    paymentMethod: PAYMENT_FROM_LIB[r.paymentMethod] ?? null,
    channel: r.channel ? CHANNEL_FROM_LIB[r.channel] : null,
    notes: r.description ?? null,
    createdBy: r.audit?.createdBy ?? '—',
    createdAt: toISO(r.audit?.createdAt),
    updatedBy: r.audit?.updatedBy ?? '—',
    updatedAt: toISO(r.audit?.updatedAt),
  };
}

export interface MovementInput {
  type: MovType;
  title: string;
  value: number;
  date: string;
  dueDate?: string | null;
  categoryId: string;
  subcategoryId?: string | null;
  accountId: string;
  paymentMethod: PaymentMethod;
  status: MovStatus;
  channel?: Channel | null;
  notes: string | null;
}

/** Erro específico de duplicidade (409) — a UI decide se reenvia com confirmDuplicate. */
export class DuplicateMovementError extends Error {}

/** Uma linha da planilha, já traduzida pro shape da tela (o parse em si é feito no front — não existe endpoint de upload). */
export interface ImportMovementItem {
  row: number;
  type: MovType;
  title: string;
  value: number;
  date: string;
  categoryName: string;
  accountName: string;
  paymentMethod: PaymentMethod | null;
  status: MovStatus;
  notes: string | null;
  valid: boolean;
  error: string | null;
}

/** Prévia lida do Excel no front — nada é gravado ainda nesse passo. */
export interface ImportMovementsPreview {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  items: ImportMovementItem[];
}

/** Resultado depois que o usuário confirma a prévia e os registros são de fato gravados. */
export interface ImportMovementsResult {
  insertedCount: number;
  items: Movement[];
  /** Linhas que falharam ao gravar no back mesmo após a prévia validar o formato (ex.: duplicata). */
  failedRows: { row: number; title: string; error: string }[];
  /** A API já tinha recebido esta importação: devolveu o resultado de antes sem gravar de novo. */
  replayed?: boolean;
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

/**
 * Número como o brasileiro digita: "1.234,50", "R$ 1.234,50", "184,5", "1234.5". Vírgula é o
 * decimal; ponto só é decimal quando não parece separador de milhar ("1.234" = 1234, "1.5" = 1,5).
 * Texto que não é número devolve 0 (a prévia recusa: "valor deve ser maior que zero").
 */
export function parseNumberBR(text: string): number {
  let t = text.replace(/R\$|\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const parsed = Number(t);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Data da planilha -> "AAAA-MM-DD". Aceita ISO e DD/MM/AAAA (também com "-" ou "."); devolve null
 * quando não é uma data de calendário real (ex.: "31/02/2026", "ontem").
 */
export function normalizeDate(text: string): string | null {
  const t = text.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t) ?? /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = /^\d{4}/.test(t);
  const [y, mo, d] = iso ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function delay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class MovimentacoesService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private movementClient = inject(MintlyClientService).client.financialMovementClient;

  /** Seed do modo mock (`environment.useMocks: true`, só local) — sem efeito quando false. */
  /** Chaves de idempotência de importações ainda sem resposta (conteúdo do lote -> chave). */
  private importKeys = new Map<string, string>();
  private mockStore: Movement[] = (mockMovements as Movement[]).map((m) => ({ ...m }));

  readonly movements = signal<Movement[]>([]);
  readonly loading = signal(false);

  private get by(): string {
    return this.auth.currentUser()?.nome ?? '—';
  }

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Executa uma chamada autenticada; em 401 tenta 1x refresh + retry antes de desistir. */
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
    return this.statusOf(err) === 401;
  }

  private statusOf(err: unknown): number | undefined {
    return (err as { response?: { status?: number } })?.response?.status;
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useMocks) {
        await delay(200);
        this.movements.set(this.mockStore.map((m) => ({ ...m })));
        return;
      }
      const response = await this.call((headers) =>
        this.movementClient.list({ page: 1, size: 500 }, headers),
      );
      this.movements.set((response.payload ?? []).map(toMovement));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Registra a movimentação. Se o servidor detectar uma possível duplicata
   * (<2min, mesma conta/título/valor/data) e `confirmDuplicate` não tiver sido
   * passado, lança DuplicateMovementError — a UI decide se reenvia confirmando.
   */
  async register(input: MovementInput, confirmDuplicate = false): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const now = new Date().toISOString();
      this.mockStore.push({
        id: `mov-${Date.now()}`,
        title: input.title,
        type: input.type,
        status: input.status,
        date: input.date,
        dueDate: input.dueDate ?? null,
        settledAt: input.status === 'received' || input.status === 'paid' ? now.slice(0, 10) : null,
        value: input.value,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        accountId: input.accountId,
        paymentMethod: input.paymentMethod,
        channel: input.channel ?? null,
        notes: input.notes,
        createdBy: this.by,
        createdAt: now,
        updatedBy: this.by,
        updatedAt: now,
      });
      await this.refresh();
      return;
    }

    const body = {
      direction: DIRECTION_TO_LIB[input.type],
      title: input.title,
      grossValue: input.value,
      date: input.date,
      accountId: input.accountId,
      categoryId: input.categoryId,
      paymentMethod: PAYMENT_TO_LIB[input.paymentMethod],
      status: fromMovStatus(input.status),
      ...(input.subcategoryId ? { subcategoryId: input.subcategoryId } : {}),
      ...(input.channel ? { channel: CHANNEL_TO_LIB[input.channel] } : {}),
      ...(input.notes ? { description: input.notes } : {}),
      ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    } satisfies RegisterMovementRequest;
    try {
      await this.call((headers) => this.movementClient.register(body, headers));
    } catch (err) {
      if (this.statusOf(err) === 409) throw new DuplicateMovementError();
      throw err;
    }
    await this.refresh();
  }

  /** direction é imutável — não faz parte do corpo de update. */
  async update(id: string, input: Omit<MovementInput, 'type' | 'status'>): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const mov = this.mockStore.find((m) => m.id === id);
      if (!mov) throw new Error('Movimentação não encontrada.');
      mov.title = input.title;
      mov.value = input.value;
      mov.date = input.date;
      mov.dueDate = input.dueDate ?? mov.dueDate;
      mov.accountId = input.accountId;
      mov.categoryId = input.categoryId;
      mov.subcategoryId = input.subcategoryId ?? null;
      mov.paymentMethod = input.paymentMethod;
      mov.channel = input.channel ?? null;
      mov.notes = input.notes;
      mov.updatedBy = this.by;
      mov.updatedAt = new Date().toISOString();
      await this.refresh();
      return;
    }

    const body = {
      title: input.title,
      grossValue: input.value,
      date: input.date,
      accountId: input.accountId,
      categoryId: input.categoryId,
      paymentMethod: PAYMENT_TO_LIB[input.paymentMethod],
      description: input.notes ?? undefined,
      subcategoryId: input.subcategoryId ?? null,
      channel: input.channel ? CHANNEL_TO_LIB[input.channel] : null,
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    } satisfies UpdateMovementRequest;
    await this.call((headers) => this.movementClient.updateMovement(id, body, headers));
    await this.refresh();
  }

  async changeStatus(id: string, status: MovStatus, settledAt?: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const mov = this.mockStore.find((m) => m.id === id);
      if (mov) {
        mov.status = status;
        if (status === 'received' || status === 'paid') {
          mov.settledAt = settledAt ?? new Date().toISOString().slice(0, 10);
        }
        mov.updatedBy = this.by;
        mov.updatedAt = new Date().toISOString();
      }
      await this.refresh();
      return;
    }

    await this.call((headers) =>
      this.movementClient.changeStatus(id, fromMovStatus(status), headers, { settledAt }),
    );
    await this.refresh();
  }

  /** Lê o .xlsx de verdade no front — não existe endpoint de upload/parse no back. */
  async previewImport(file: File): Promise<ImportMovementsPreview> {
    return this.fetchPreview(file);
  }

  /**
   * Grava de fato as linhas informadas (já filtradas/editadas na tela — inclusive linhas que o
   * usuário corrigiu na hora, sem precisar reenviar a planilha). Em modo real, tudo vai junto para
   * `POST /financial-movements/import` (em lotes de até `IMPORT_MOVEMENTS_MAX_ROWS`) e a API
   * devolve o resultado de cada linha: a que falhar (ex.: duplicata) entra em `failedRows` e não
   * interrompe as demais. Categoria/conta são resolvidas pelo nome contra os cadastros atuais.
   */
  async confirmImport(
    items: ImportMovementItem[],
    lookup: {
      categories: { id: string; name: string; type: MovType }[];
      accounts: { id: string; name: string }[];
    },
  ): Promise<ImportMovementsResult> {
    if (environment.useMocks) {
      const result = await this.fetchConfirmMock(items);
      await this.refresh();
      return result;
    }

    const inserted: Movement[] = [];
    const failedRows: { row: number; title: string; error: string }[] = [];
    // A prévia aceita nome de categoria/conta sem diferenciar caixa e espaços; a gravação tem que
    // achar pelo mesmo critério, senão a linha passa na prévia e falha na hora de gravar.
    // A categoria também casa pelo TIPO da linha: o mesmo nome pode existir em receita e em
    // despesa, e a API recusa categoria de tipo diferente do lançamento.
    const categories = new Map(
      lookup.categories.map((c) => [`${c.type}|${normalizeName(c.name)}`, c.id]),
    );
    const accounts = new Map(lookup.accounts.map((a) => [normalizeName(a.name), a.id]));
    // Linhas idênticas dentro do mesmo arquivo são vendas repetidas de propósito (ex.: duas
    // "Venda balcão" de mesmo valor no dia): só a 1ª passa pela trava de duplicidade da API; as
    // seguintes são confirmadas. A 1ª continua protegida contra reenvio em menos de 2 minutos.
    const seen = new Set<string>();
    const rows: ImportMovementRow[] = [];
    for (const item of items) {
      const categoryId = categories.get(`${item.type}|${normalizeName(item.categoryName)}`);
      const accountId = accounts.get(normalizeName(item.accountName));
      if (!categoryId || !accountId) {
        failedRows.push({
          row: item.row,
          title: item.title,
          error: 'Categoria ou conta não encontrada.',
        });
        continue;
      }
      const key = [accountId, normalizeName(item.title), item.value, item.date].join('|');
      const repeated = seen.has(key);
      seen.add(key);
      rows.push({
        row: item.row,
        direction: DIRECTION_TO_LIB[item.type],
        title: item.title,
        grossValue: item.value,
        date: item.date,
        accountId,
        categoryId,
        paymentMethod: PAYMENT_TO_LIB[item.paymentMethod ?? 'Dinheiro'],
        status: fromMovStatus(item.status),
        ...(item.notes ? { description: item.notes } : {}),
        ...(repeated ? { confirmDuplicate: true } : {}),
      });
    }

    const titles = new Map(items.map((i) => [i.row, i.title]));
    let replayed = false;
    for (let from = 0; from < rows.length; from += IMPORT_MOVEMENTS_MAX_ROWS) {
      const chunk = rows.slice(from, from + IMPORT_MOVEMENTS_MAX_ROWS);
      const idempotencyKey = this.importKeyFor(chunk);
      const response = await this.call((headers) =>
        this.movementClient.importMovements({ idempotencyKey, rows: chunk }, headers),
      );
      const result = response.payload;
      if (!result) throw new Error('A API não devolveu o resultado da importação.');
      // Chegou resposta: a próxima importação desse mesmo conteúdo é uma nova, não um reenvio.
      this.importKeys.delete(JSON.stringify(chunk));
      replayed ||= result.replayed;
      for (const r of result.results) {
        if (r.status === 'created' && r.movement) {
          inserted.push(toMovement(r.movement));
        } else {
          failedRows.push({
            row: r.row,
            title: titles.get(r.row) ?? '',
            error: this.importFailure(r.error),
          });
        }
      }
    }
    failedRows.sort((a, b) => a.row - b.row);
    await this.refresh();
    return { insertedCount: inserted.length, items: inserted, failedRows, replayed };
  }

  /**
   * Chave de idempotência da importação. É a mesma enquanto o pedido não obtiver resposta (ex.: a
   * rede caiu e a pessoa clica de novo): a API reconhece e devolve o resultado em vez de gravar
   * tudo outra vez. Depois de uma resposta a chave é descartada, então importar de propósito o
   * mesmo arquivo de novo (ex.: depois de apagar os lançamentos) funciona.
   */
  private importKeyFor(chunk: ImportMovementRow[]): string {
    const fingerprint = JSON.stringify(chunk);
    let key = this.importKeys.get(fingerprint);
    if (!key) {
      key = `imp-${globalThis.crypto.randomUUID()}`;
      this.importKeys.set(fingerprint, key);
    }
    return key;
  }

  /** Motivo da falha de uma linha, em linguagem de gente: usa o que a API respondeu. */
  private importFailure(error: { code: string; message: string } | undefined): string {
    if (error?.code === 'VALIDATION_ERROR') {
      return 'A API recusou os dados: confira data, valor e se a categoria é do mesmo tipo da linha.';
    }
    return error?.message || 'Falha ao gravar.';
  }

  /**
   * Lê o .xlsx de verdade (colunas na mesma ordem do modelo baixado: Tipo, Título, Valor,
   * Data, Categoria, Conta, Forma de pagamento, Status, Observações) e monta a prévia.
   * Só valida o que é formato de célula aqui (célula vazia, tipo/status não reconhecido...) —
   * se a categoria/conta existe de verdade é revalidado na tela, contra os cadastros atuais.
   */
  private async fetchPreview(file: File): Promise<ImportMovementsPreview> {
    const formatoMsg =
      'Não foi possível ler o arquivo. Envie uma planilha .xlsx (baixe o modelo e preencha).';
    if (!/\.xlsx$/i.test(file.name)) throw new Error(formatoMsg);
    const workbook = new Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new Error(formatoMsg);
    }
    const sheet = workbook.getWorksheet('Movimentações') ?? workbook.worksheets[0];
    if (!sheet) {
      throw new Error('Não foi possível ler nenhuma aba no arquivo enviado.');
    }

    const TIPO_MAP: Record<string, MovType> = { receita: 'income', despesa: 'expense' };
    const STATUS_MAP: Record<string, MovStatus> = {
      recebido: 'received',
      pago: 'paid',
      pendente: 'pending',
      cancelado: 'cancelled',
    };

    const cellText = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
        return String((value as { text: unknown }).text ?? '').trim();
      }
      return String(value).trim();
    };
    const cellDate = (value: unknown): string => {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return cellText(value);
    };
    const cellNumber = (value: unknown): number =>
      typeof value === 'number' ? value : parseNumberBR(cellText(value));

    const items: ImportMovementItem[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // cabeçalho
      const tipoRaw = cellText(row.getCell(1).value).toLowerCase();
      const title = cellText(row.getCell(2).value);
      const value = cellNumber(row.getCell(3).value);
      const dateRaw = cellDate(row.getCell(4).value);
      const date = normalizeDate(dateRaw) ?? dateRaw;
      const categoryName = cellText(row.getCell(5).value);
      const accountName = cellText(row.getCell(6).value);
      const paymentRaw = cellText(row.getCell(7).value);
      const statusRaw = cellText(row.getCell(8).value).toLowerCase();
      const notes = cellText(row.getCell(9).value) || null;

      // Linha inteiramente vazia (sobra de formatação) — ignora.
      if (!tipoRaw && !title && !value && !date && !categoryName && !accountName) return;

      const errors: string[] = [];
      const type = TIPO_MAP[tipoRaw];
      if (!type) errors.push(`tipo "${tipoRaw || '(vazio)'}" inválido (use receita ou despesa)`);
      if (!title) errors.push('título vazio');
      if (!(value > 0)) errors.push('valor deve ser maior que zero');
      if (!dateRaw) errors.push('data vazia');
      else if (normalizeDate(dateRaw) === null) {
        errors.push(`data "${dateRaw}" inválida (use AAAA-MM-DD ou DD/MM/AAAA)`);
      }
      if (!categoryName) errors.push('categoria vazia');
      if (!accountName) errors.push('conta vazia');

      const paymentMethod = (PAYMENT_METHODS as readonly string[]).includes(paymentRaw)
        ? (paymentRaw as PaymentMethod)
        : null;
      const status = STATUS_MAP[statusRaw] ?? 'pending';

      items.push({
        row: rowNumber,
        type: type ?? 'income',
        title,
        value,
        date,
        categoryName,
        accountName,
        paymentMethod,
        status,
        notes,
        valid: errors.length === 0,
        error: errors.length ? errors.join('; ') : null,
      });
    });

    const validRows = items.filter((i) => i.valid).length;
    return {
      fileName: file.name,
      totalRows: items.length,
      validRows,
      invalidRows: items.length - validRows,
      items,
    };
  }

  private async fetchConfirmMock(items: ImportMovementItem[]): Promise<ImportMovementsResult> {
    await delay(500);
    const now = new Date().toISOString();
    const inserted = items.map((i): Movement => {
      const mov: Movement = {
        id: `import-${Date.now()}-${this.mockStore.length}`,
        title: i.title,
        type: i.type,
        status: i.status,
        date: i.date,
        dueDate: null,
        settledAt: i.status === 'received' || i.status === 'paid' ? i.date : null,
        value: i.value,
        categoryId: null,
        subcategoryId: null,
        accountId: null,
        paymentMethod: i.paymentMethod,
        channel: null,
        notes: i.notes,
        createdBy: this.by,
        createdAt: now,
        updatedBy: this.by,
        updatedAt: now,
      };
      this.mockStore.push(mov);
      return mov;
    });
    return { insertedCount: inserted.length, items: inserted, failedRows: [] };
  }
}
