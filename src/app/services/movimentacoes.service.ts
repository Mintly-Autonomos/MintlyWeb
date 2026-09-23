import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Workbook } from 'exceljs';
import { MovementDirection, MovementStatus, PaymentMethod as LibPaymentMethod } from 'mintly-lib';
import type { FinancialMovement, Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';

export type MovType = 'income' | 'expense';
export type MovStatus = 'received' | 'paid' | 'pending' | 'cancelled';
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
  value: number;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
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
function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Converte a entity da lib (FinancialMovement, com account/category como Extended Reference) pro shape da tela. */
function toMovement(raw: FinancialMovement): Movement {
  const r = raw as unknown as {
    _id?: string;
    id?: string;
    title: string;
    direction: MovementDirection;
    status: MovementStatus;
    date: unknown;
    grossValue: number;
    account?: { _id: string };
    category?: { _id: string };
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
    value: r.grossValue,
    categoryId: r.category?._id ?? null,
    accountId: r.account?._id ?? null,
    paymentMethod: PAYMENT_FROM_LIB[r.paymentMethod] ?? null,
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
  categoryId: string;
  accountId: string;
  paymentMethod: PaymentMethod;
  status: MovStatus;
  notes: string | null;
}

/** Erro específico de duplicidade (409) — a UI decide se reenvia com confirmDuplicate. */
export class DuplicateMovementError extends Error {}

/** Uma linha da planilha, já traduzida pro shape da tela (o parse em si é feito no servidor). */
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

/** Prévia devolvida pelo servidor após ler a planilha — nada é gravado ainda nesse passo. */
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
}

@Injectable({ providedIn: 'root' })
export class MovimentacoesService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private movementClient = inject(MintlyClientService).client.financialMovementClient;

  readonly movements = signal<Movement[]>([]);
  readonly loading = signal(false);

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
    const body = {
      direction: DIRECTION_TO_LIB[input.type],
      title: input.title,
      grossValue: input.value,
      date: input.date,
      accountId: input.accountId,
      categoryId: input.categoryId,
      paymentMethod: PAYMENT_TO_LIB[input.paymentMethod],
      status: fromMovStatus(input.status),
      ...(input.notes ? { description: input.notes } : {}),
      ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
    };
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
    const body = {
      title: input.title,
      grossValue: input.value,
      date: input.date,
      accountId: input.accountId,
      categoryId: input.categoryId,
      paymentMethod: PAYMENT_TO_LIB[input.paymentMethod],
      description: input.notes ?? undefined,
    };
    await this.call((headers) => this.movementClient.updateMovement(id, body, headers));
    await this.refresh();
  }

  async changeStatus(id: string, status: MovStatus): Promise<void> {
    await this.call((headers) =>
      this.movementClient.changeStatus(id, fromMovStatus(status), headers),
    );
    await this.refresh();
  }

  /**
   * TODO(API): não existe endpoint de importação em massa na mintly-lib ainda — o desenho real é
   * enviar o arquivo (multipart) pro servidor, que lê a planilha e devolve essa prévia (nada é
   * gravado neste passo). Por ora quem lê o .xlsx é o próprio front (ExcelJS) — quando o endpoint
   * existir, troca só o corpo de `fetchPreview` por uma chamada à API.
   */
  async previewImport(file: File): Promise<ImportMovementsPreview> {
    return this.call(() => this.fetchPreview(file));
  }

  /**
   * Grava de fato as linhas informadas (já filtradas/editadas na tela — inclusive linhas que o
   * usuário corrigiu na hora, sem precisar reenviar a planilha) — depois recarrega a lista.
   */
  async confirmImport(items: ImportMovementItem[]): Promise<ImportMovementsResult> {
    const result = await this.call(() => this.fetchConfirm(items));
    await this.refresh();
    return result;
  }

  /**
   * Lê o .xlsx de verdade (colunas na mesma ordem do modelo baixado: Tipo, Título, Valor,
   * Data, Categoria, Conta, Forma de pagamento, Status, Observações) e monta a prévia.
   * Só valida o que é formato de célula aqui (célula vazia, tipo/status não reconhecido...) —
   * se a categoria/conta existe de verdade é revalidado na tela, contra os cadastros atuais.
   */
  private async fetchPreview(file: File): Promise<ImportMovementsPreview> {
    const buffer = await file.arrayBuffer();
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);
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
    const cellNumber = (value: unknown): number => {
      if (typeof value === 'number') return value;
      const parsed = parseFloat(cellText(value).replace(',', '.'));
      return isNaN(parsed) ? 0 : parsed;
    };

    const items: ImportMovementItem[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // cabeçalho
      const tipoRaw = cellText(row.getCell(1).value).toLowerCase();
      const title = cellText(row.getCell(2).value);
      const value = cellNumber(row.getCell(3).value);
      const date = cellDate(row.getCell(4).value);
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
      if (!date) errors.push('data vazia');
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

  private async fetchConfirm(items: ImportMovementItem[]): Promise<ImportMovementsResult> {
    await new Promise((r) => setTimeout(r, 500));
    const now = new Date().toISOString();
    const inserted = items.map(
      (i, idx): Movement => ({
        id: `import-${Date.now()}-${idx}`,
        title: i.title,
        type: i.type,
        status: i.status,
        date: i.date,
        value: i.value,
        categoryId: null,
        accountId: null,
        paymentMethod: i.paymentMethod,
        notes: i.notes,
        createdBy: this.auth.currentUser()?.nome ?? '—',
        createdAt: now,
        updatedBy: this.auth.currentUser()?.nome ?? '—',
        updatedAt: now,
      }),
    );
    return { insertedCount: inserted.length, items: inserted };
  }
}
