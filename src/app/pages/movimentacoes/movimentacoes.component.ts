import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Workbook } from 'exceljs';
import {
  parseNumberBR,
  MovimentacoesService,
  Movement,
  MovType,
  MovStatus,
  PaymentMethod,
  PAYMENT_METHODS,
  STATUS_META,
  DuplicateMovementError,
  ImportMovementItem,
  ImportMovementsResult,
} from '../../services/movimentacoes.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import {
  FilterBarComponent,
  FilterSelectComponent,
  FilterDateRangeComponent,
} from '../../shared/filter-bar.component';
import { ContasService } from '../../services/contas.service';
import { CategoriasService } from '../../services/categorias.service';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, fmtDateTime, fmtShortDate, localISODate } from '../../shared/format';
import { MoneyInputDirective } from '../../shared/money-input.directive';
import { moneyToInput, padMoneyInput } from '../../shared/money-input';
import { apiErrorMessage, isNoResponseError } from '../../shared/api-error-message';
import { matchName } from '../../shared/import-parse';

// Data de hoje no calendário de quem usa (toISOString é UTC: depois das 21h já seria "amanhã").
function isoToday(): string {
  return localISODate();
}
function isoAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localISODate(d);
}

type Period = 'all' | 'today' | '7d' | '30d' | 'custom';

const FEE_RATES: Record<string, number> = { iFood: 12, Rappi: 15 };

/** Linha da prévia de importação, editável na tela antes de confirmar. */
interface EditableImportRow {
  row: number;
  /** `null`: a planilha não trouxe — a pessoa escolhe na revisão (assim também forma de pagamento e status). */
  type: MovType | null;
  title: string;
  value: number;
  /** O que aparece no campo Valor ("1.234,00"); `value` é o número lido dele. */
  valueText: string;
  date: string;
  dateRaw?: string;
  categoryName: string;
  accountName: string;
  paymentMethod: PaymentMethod | null;
  status: MovStatus | null;
  notes: string | null;
  /** Se vai ser gravada ao confirmar — só pode ser true quando `valid` também é. */
  included: boolean;
  valid: boolean;
  error: string | null;
  /** Parece já lançada (mesma conta, título, valor e data): vem desmarcada, mas dá para incluir. */
  possibleDuplicate?: boolean;
}

interface MovForm {
  type: MovType;
  title: string;
  value: string;
  date: string;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | '';
  status: MovStatus;
  notes: string;
}

@Component({
  selector: 'app-movimentacoes',
  standalone: true,
  imports: [
    FormsModule,
    MoneyInputDirective,
    IconComponent,
    ChipComponent,
    ModalComponent,
    EmptyStateComponent,
    FilterBarComponent,
    FilterSelectComponent,
    FilterDateRangeComponent,
  ],
  templateUrl: './movimentacoes.component.html',
})
export class MovimentacoesComponent implements OnInit {
  private svc = inject(MovimentacoesService);
  private contasSvc = inject(ContasService);
  private categoriasSvc = inject(CategoriasService);
  private toast = inject(ToastService);

  // ── UI state ──────────────────────────────────────────────────────────
  protected creating = signal(false);
  protected editing = signal<Movement | null>(null);
  protected details = signal<Movement | null>(null);
  protected duplicate = signal<boolean>(false);
  protected pendingForm = signal<MovForm | null>(null);

  // ── Importação em massa ──────────────────────────────────────────────
  protected importMode = signal(false);
  protected importFile = signal<File | null>(null);
  protected importDragOver = signal(false);
  protected importing = signal(false);
  protected importPreviewOpen = signal(false);
  protected importFileName = signal('');
  protected importRows = signal<EditableImportRow[]>([]);
  protected importConfirmWarningOpen = signal(false);
  protected confirmingImport = signal(false);
  /** Andamento da gravação: "Importando 20 de 55…". */
  protected importProgress = signal<{ done: number; total: number } | null>(null);
  protected importResult = signal<ImportMovementsResult | null>(null);

  protected importTypeOpts: { value: MovType; label: string }[] = [
    { value: 'income', label: 'Receita' },
    { value: 'expense', label: 'Despesa' },
  ];
  protected importStatusOpts: { value: MovStatus; label: string }[] = [
    { value: 'received', label: 'Recebido' },
    { value: 'paid', label: 'Pago' },
    { value: 'pending', label: 'Pendente' },
    { value: 'cancelled', label: 'Cancelado' },
  ];

  protected allActiveCategories = computed(() =>
    this.categoriasSvc.categories().filter((c) => c.active),
  );

  protected importValidCount = computed(() => this.importRows().filter((r) => r.valid).length);
  protected importIncludedCount = computed(
    () => this.importRows().filter((r) => r.included && r.valid).length,
  );
  protected importExcludedRows = computed(() =>
    this.importRows().filter((r) => !r.included || !r.valid),
  );
  protected importExcludedCount = computed(() => this.importExcludedRows().length);
  protected importDuplicateCount = computed(
    () => this.importRows().filter((r) => r.possibleDuplicate).length,
  );

  // ── Filters ───────────────────────────────────────────────────────────
  protected query = signal('');
  protected typeFilter = signal<'all' | MovType>('all');
  protected statusFilter = signal<'all' | MovStatus>('all');
  protected period = signal<Period>('all');
  protected dateFrom = signal('');
  protected dateTo = signal('');

  // ── Form ──────────────────────────────────────────────────────────────
  protected form = signal<MovForm>({
    type: 'income',
    title: '',
    value: '',
    date: isoToday(),
    categoryId: null,
    accountId: null,
    paymentMethod: '',
    status: 'pending',
    notes: '',
  });

  // ── Data ──────────────────────────────────────────────────────────────
  protected movements = this.svc.movements;
  protected loading = this.svc.loading;
  protected accounts = computed(() => this.contasSvc.accounts().filter((a) => a.active));
  // Só categorias ativas do mesmo tipo (receita/despesa) da movimentação — o
  // servidor rejeita a combinação direction×category.type divergente.
  protected categories = computed(() =>
    this.categoriasSvc.categories().filter((c) => c.active && c.type === this.form().type),
  );
  protected paymentMethods = PAYMENT_METHODS;
  protected statusMeta = STATUS_META;
  protected fmtBRL = formatBRL;
  protected fmtDate = fmtDateTime;
  protected fmtShort = fmtShortDate;
  // O formulário aceita "12,50" e "1.234,50" (o parseFloat nativo leria 12 e 1,234).
  readonly parseFloat = parseNumberBR;

  // ── Options ───────────────────────────────────────────────────────────
  protected typeOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'income', label: 'Receita' },
    { value: 'expense', label: 'Despesa' },
  ];
  /**
   * "Recebido" só existe em entrada e "Pago" só em saída: com o tipo escolhido o filtro mostra só o
   * que faz sentido; sem tipo, mostra os dois.
   */
  protected statusOpts = computed(() => {
    const type = this.typeFilter();
    return [
      { value: 'all', label: 'Todos' },
      ...(type !== 'expense' ? [{ value: 'received', label: 'Recebido' }] : []),
      ...(type !== 'income' ? [{ value: 'paid', label: 'Pago' }] : []),
      { value: 'pending', label: 'Pendente' },
      { value: 'cancelled', label: 'Cancelado' },
    ];
  });

  /** Trocou o tipo e o status escolhido deixou de existir nele (ex.: "Pago" em Receita): volta para "Todos". */
  protected setTypeFilter(type: 'all' | MovType): void {
    this.typeFilter.set(type);
    const status = this.statusFilter();
    if ((type === 'income' && status === 'paid') || (type === 'expense' && status === 'received')) {
      this.statusFilter.set('all');
    }
  }
  protected periodOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: 'custom', label: 'Personalizado' },
  ];

  // ── Computed ──────────────────────────────────────────────────────────
  protected activeFilters = computed(
    () =>
      (this.typeFilter() !== 'all' ? 1 : 0) +
      (this.statusFilter() !== 'all' ? 1 : 0) +
      (this.period() !== 'all' ? 1 : 0),
  );

  protected filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const from = this.resolvedFrom();
    const to = this.resolvedTo();
    return this.movements()
      .filter((m) => {
        if (this.typeFilter() !== 'all' && m.type !== this.typeFilter()) return false;
        if (this.statusFilter() !== 'all' && m.status !== this.statusFilter()) return false;
        if (from && m.date < from) return false;
        if (to && m.date > to) return false;
        if (q && !m.title.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  protected totalIn = computed(() =>
    this.filtered()
      .filter((m) => m.type === 'income' && m.status === 'received')
      .reduce((s, m) => s + m.value, 0),
  );
  protected totalOut = computed(() =>
    this.filtered()
      .filter((m) => m.type === 'expense' && m.status === 'paid')
      .reduce((s, m) => s + m.value, 0),
  );
  protected totalPending = computed(() =>
    this.filtered()
      .filter((m) => m.status === 'pending')
      .reduce((s, m) => s + (m.type === 'income' ? m.value : -m.value), 0),
  );

  ngOnInit(): void {
    this.svc.refresh().catch((err) => this.toast.error(this.errMsg(err)));
    this.categoriasSvc.refresh().catch((err) => this.toast.error(this.errMsg(err)));
    // Contas não é injetada só pra leitura aqui — sem isso, abrir Movimentações
    // direto (sem passar por Contas antes) deixa o dropdown de conta vazio.
    this.contasSvc.refresh().catch((err) => this.toast.error(this.errMsg(err)));
  }

  clearFilters(): void {
    this.typeFilter.set('all');
    this.statusFilter.set('all');
    this.period.set('all');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  private resolvedFrom(): string {
    if (this.period() === 'today') return isoToday();
    if (this.period() === '7d') return isoAgo(7);
    if (this.period() === '30d') return isoAgo(30);
    if (this.period() === 'custom') return this.dateFrom();
    return '';
  }
  private resolvedTo(): string {
    if (this.period() === 'today') return isoToday();
    if (this.period() === 'custom') return this.dateTo();
    return '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  get isPlatformAccount(): boolean {
    const id = this.form().accountId;
    if (!id) return false;
    const a = this.contasSvc.accounts().find((x) => x.id === id);
    return a?.type === 'Financial Platform';
  }

  get platformFee(): number {
    const val = parseNumberBR(this.form().value) || 0;
    const id = this.form().accountId;
    if (!id || !this.isPlatformAccount) return 0;
    const acc = this.contasSvc.accounts().find((x) => x.id === id);
    const rate = acc?.taxPct ?? FEE_RATES[acc?.name ?? ''] ?? 0;
    return val * (rate / 100);
  }

  protected readonly TITLE_MAX = 120;
  protected readonly NOTES_MAX = 500;

  /** Linhas da revisão com o campo de Observações aberto (as demais ficam recolhidas para a tabela caber na tela). */
  protected notesOpen = signal<ReadonlySet<number>>(new Set());

  toggleNotes(rowNumber: number): void {
    this.notesOpen.update((open) => {
      const next = new Set(open);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  /** Aberto pela pessoa; ou aberto à força quando as observações estouram o limite (o erro precisa de onde corrigir). */
  notesVisible(row: EditableImportRow): boolean {
    return this.notesOpen().has(row.row) || (row.notes?.length ?? 0) > this.NOTES_MAX;
  }

  protected readonly tipoOpts: { value: MovType; label: string; desc: string; icon: string }[] = [
    { value: 'income', label: 'Entrada', desc: 'Aumenta o caixa do negócio', icon: 'trending_up' },
    { value: 'expense', label: 'Saída', desc: 'Reduz o caixa do negócio', icon: 'trending_down' },
  ];

  protected readonly paymentIcons: Record<string, string> = {
    Dinheiro: 'payments',
    PIX: 'bolt',
    Débito: 'credit_card',
    Crédito: 'credit_score',
    Transferência: 'compare_arrows',
    Boleto: 'receipt_long',
    'Carteira Digital': 'account_balance_wallet',
  };

  /** Status do formulário: liquidado (Recebido/Pago, pelo tipo), Pendente e Cancelado, com o impacto no saldo. */
  protected get statusCards(): { value: MovStatus; label: string; icon: string; impact: string }[] {
    const settled: MovStatus = this.form().type === 'income' ? 'received' : 'paid';
    return [
      {
        value: settled,
        label: settled === 'received' ? 'Recebido' : 'Pago',
        icon: 'check_circle',
        impact: 'Afeta saldo disponível',
      },
      { value: 'pending', label: 'Pendente', icon: 'schedule', impact: 'Afeta saldo previsto' },
      { value: 'cancelled', label: 'Cancelado', icon: 'cancel', impact: 'Sem impacto no saldo' },
    ];
  }

  protected get titleError(): string {
    const t = this.form().title;
    return t.length > 0 && !t.trim() ? 'Informe um título para a movimentação.' : '';
  }

  protected get amountError(): string {
    const v = this.form().value;
    return v.trim() !== '' && !(parseNumberBR(v) > 0) ? 'Informe um valor maior que zero.' : '';
  }

  protected get dateError(): string {
    return this.form().date ? '' : 'Selecione uma data.';
  }

  /** Previsão de repasse: data do lançamento + prazo da conta de plataforma (só em entradas). */
  protected get settlementDate(): string | null {
    const f = this.form();
    if (f.type !== 'income' || !this.isPlatformAccount || !f.date) return null;
    const days = this.contasSvc.accounts().find((a) => a.id === f.accountId)?.settlementDays;
    if (!days) return null;
    const [y, m, d] = f.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  protected get platformRate(): number {
    const acc = this.contasSvc.accounts().find((x) => x.id === this.form().accountId);
    return acc?.taxPct ?? FEE_RATES[acc?.name ?? ''] ?? 0;
  }

  protected get settlementDays(): number {
    return (
      this.contasSvc.accounts().find((x) => x.id === this.form().accountId)?.settlementDays ?? 0
    );
  }

  get netValue(): number {
    return (parseNumberBR(this.form().value) || 0) - this.platformFee;
  }

  get formValid(): boolean {
    const f = this.form();
    return (
      !!f.title.trim() &&
      (parseNumberBR(f.value) || 0) > 0 &&
      !!f.date &&
      !!f.accountId &&
      !!f.categoryId &&
      !!f.paymentMethod
    );
  }

  categoryName(id: string | null): string {
    return this.categoriasSvc.categories().find((c) => c.id === id)?.name ?? '—';
  }
  accountName(id: string | null): string {
    return this.contasSvc.accounts().find((a) => a.id === id)?.name ?? '—';
  }

  setFormField<K extends keyof MovForm>(k: K, v: MovForm[K]): void {
    this.form.update((f) => ({ ...f, [k]: v }));
  }

  /** Switches the movement type, keeping the status valid for the new type. */
  setType(type: MovType): void {
    this.form.update((f) => {
      const settled: MovStatus = type === 'income' ? 'received' : 'paid';
      const valid: MovStatus[] = [settled, 'pending', 'cancelled'];
      return {
        ...f,
        type,
        // receita <-> despesa: "recebido"/"pago" são o mesmo estado liquidado.
        status: valid.includes(f.status)
          ? f.status
          : f.status === 'received' || f.status === 'paid'
            ? settled
            : 'pending',
        // categoria trocou de universo (receita/despesa) — evita mandar um id incompatível.
        categoryId: null,
      };
    });
  }

  private errMsg(err: unknown): string {
    return apiErrorMessage(err);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────
  /** Conta padrão (ou a única ativa) — já vem selecionada no formulário. */
  private defaultAccountId(): string | null {
    const active = this.accounts();
    return (
      (active.find((a) => a.isDefault) ?? (active.length === 1 ? active[0] : undefined))?.id ?? null
    );
  }

  openCreate(type: MovType = 'income'): void {
    this.form.set({
      type,
      title: '',
      value: '',
      date: isoToday(),
      categoryId: null,
      accountId: this.defaultAccountId(),
      paymentMethod: '',
      status: type === 'income' ? 'received' : 'paid',
      notes: '',
    });
    this.importMode.set(false);
    this.importFile.set(null);
    this.creating.set(true);
  }

  openEdit(m: Movement): void {
    this.form.set({
      type: m.type,
      title: m.title,
      value: moneyToInput(m.value),
      date: m.date,
      categoryId: m.categoryId,
      accountId: m.accountId,
      paymentMethod: m.paymentMethod ?? '',
      status: m.status,
      notes: m.notes ?? '',
    });
    this.editing.set(m);
  }

  closeModal(): void {
    this.creating.set(false);
    this.editing.set(null);
    this.duplicate.set(false);
    this.pendingForm.set(null);
    this.importMode.set(false);
    this.importFile.set(null);
    this.importDragOver.set(false);
  }

  // ── Importação em massa ──────────────────────────────────────────────

  toggleImportMode(): void {
    this.importMode.update((v) => !v);
    this.importFile.set(null);
  }

  /**
   * Gera e baixa um .xlsx real (com dropdowns nas colunas de seleção) a partir das contas,
   * categorias e formas de pagamento que o restaurante já tem cadastradas — por isso é montado
   * aqui no front: só o cliente tem essas listas carregadas na hora do download.
   */
  async downloadTemplate(): Promise<void> {
    try {
      const contas = this.contasSvc
        .accounts()
        .filter((a) => a.active)
        .map((a) => a.name);
      const incomeCategorias = this.categoriasSvc
        .categories()
        .filter((c) => c.active && c.type === 'income')
        .map((c) => c.name);
      const expenseCategorias = this.categoriasSvc
        .categories()
        .filter((c) => c.active && c.type === 'expense')
        .map((c) => c.name);
      const categorias = [...incomeCategorias, ...expenseCategorias];
      const tipos = ['receita', 'despesa'];
      const statusOpts = ['Recebido', 'Pago', 'Pendente', 'Cancelado'];
      const formas = [...this.paymentMethods];

      const workbook = new Workbook();

      // Aba oculta só com as listas — serve de fonte pros dropdowns da aba principal.
      const listsSheet = workbook.addWorksheet('Listas');
      listsSheet.state = 'veryHidden';
      const lists: { col: string; values: string[] }[] = [
        { col: 'A', values: tipos },
        { col: 'B', values: statusOpts },
        { col: 'C', values: contas.length ? contas : ['(cadastre uma conta primeiro)'] },
        {
          col: 'D',
          values: categorias.length ? categorias : ['(cadastre uma categoria primeiro)'],
        },
        { col: 'E', values: formas },
      ];
      for (const { col, values } of lists) {
        values.forEach((v, i) => {
          listsSheet.getCell(`${col}${i + 1}`).value = v;
        });
      }

      const sheet = workbook.addWorksheet('Movimentações');
      sheet.columns = [
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Título', key: 'titulo', width: 28 },
        { header: 'Valor', key: 'valor', width: 12 },
        { header: 'Data (AAAA-MM-DD)', key: 'data', width: 18 },
        { header: 'Categoria', key: 'categoria', width: 22 },
        { header: 'Conta', key: 'conta', width: 22 },
        { header: 'Forma de pagamento', key: 'formaPagamento', width: 20 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Observações', key: 'observacoes', width: 30 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F7EF' } };

      // Linhas de exemplo já preenchidas (com dados reais, quando existem) — dá pra
      // baixar e reenviar direto pra testar a importação sem digitar nada.
      const cycle = (arr: string[], i: number, fallback: string) =>
        arr.length ? arr[i % arr.length] : fallback;
      const exampleRows: {
        tipo: string;
        titulo: string;
        valor: number;
        categoria: string;
        conta: string;
        formaPagamento: string;
        status: string;
        observacoes: string;
      }[] = [
        {
          tipo: 'receita',
          titulo: 'Venda balcão',
          valor: 184.5,
          categoria: cycle(incomeCategorias, 0, '(cadastre uma categoria de receita)'),
          conta: cycle(contas, 0, '(cadastre uma conta)'),
          formaPagamento: cycle(formas, 0, ''),
          status: 'Recebido',
          observacoes: '',
        },
        {
          tipo: 'receita',
          titulo: 'Repasse iFood',
          valor: 342.8,
          categoria: cycle(incomeCategorias, 1, '(cadastre uma categoria de receita)'),
          conta: cycle(contas, 1, '(cadastre uma conta)'),
          formaPagamento: cycle(formas, 1, ''),
          status: 'Pendente',
          observacoes: '',
        },
        {
          tipo: 'despesa',
          titulo: 'Compra de insumos',
          valor: 620,
          categoria: cycle(expenseCategorias, 0, '(cadastre uma categoria de despesa)'),
          conta: cycle(contas, 0, '(cadastre uma conta)'),
          formaPagamento: cycle(formas, 2, ''),
          status: 'Pago',
          observacoes: 'Fornecedor de hortifruti',
        },
        {
          tipo: 'despesa',
          titulo: 'Conta de energia',
          valor: 245.9,
          categoria: cycle(expenseCategorias, 1, '(cadastre uma categoria de despesa)'),
          conta: cycle(contas, 1, '(cadastre uma conta)'),
          formaPagamento: cycle(formas, 3, ''),
          status: 'Pendente',
          observacoes: '',
        },
      ];
      exampleRows.forEach((r, i) => {
        sheet.addRow({
          tipo: r.tipo,
          titulo: r.titulo,
          valor: r.valor,
          data: isoAgo(i),
          categoria: r.categoria,
          conta: r.conta,
          formaPagamento: r.formaPagamento,
          status: r.status,
          observacoes: r.observacoes,
        });
      });

      const validations: { column: string; col: string; count: number }[] = [
        { column: 'A', col: 'A', count: tipos.length },
        { column: 'H', col: 'B', count: statusOpts.length },
        { column: 'F', col: 'C', count: Math.max(contas.length, 1) },
        { column: 'E', col: 'D', count: Math.max(categorias.length, 1) },
        { column: 'G', col: 'E', count: formas.length },
      ];
      const lastRow = 200;
      for (const v of validations) {
        for (let r = 2; r <= lastRow; r++) {
          sheet.getCell(`${v.column}${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`Listas!$${v.col}$1:$${v.col}$${v.count}`],
          };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo-movimentacoes.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.toast.error('Não foi possível gerar o modelo. Tente novamente.');
    }
  }

  onImportDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.importDragOver.set(true);
  }

  onImportDragLeave(): void {
    this.importDragOver.set(false);
  }

  onImportDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.importDragOver.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.importFile.set(file);
  }

  onImportFilePicked(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.importFile.set(file);
  }

  removeImportFile(): void {
    this.importFile.set(null);
  }

  async submitImport(): Promise<void> {
    const file = this.importFile();
    if (!file) return;
    this.importing.set(true);
    try {
      const preview = await this.svc.previewImport(file);
      this.creating.set(false);
      this.importFileName.set(preview.fileName);
      this.importRows.set(
        preview.items.map((item) => {
          // Categoria e conta da planilha viram o nome EXATO do cadastro ("Venda delivery" ->
          // "Venda Delivery"): a lista da tela só marca a opção com o nome idêntico, e sem isso a
          // categoria já preenchida na planilha aparecia como se estivesse em branco.
          const category = this.canonicalCategory(item.categoryName, item.type);
          const account = matchName(item.accountName, this.accounts());
          const revalidated = this.revalidateRow({
            row: item.row,
            type: item.type,
            title: item.title,
            value: item.value,
            valueText: item.value > 0 ? moneyToInput(item.value) : '',
            date: item.date,
            dateRaw: item.dateRaw,
            categoryName: category?.name ?? item.categoryName,
            accountName: account?.name ?? item.accountName,
            paymentMethod: item.paymentMethod,
            status: item.status,
            notes: item.notes,
            included: true,
            valid: true,
            error: null,
          });
          return this.flagPossibleDuplicate(revalidated);
        }),
      );
      this.importPreviewOpen.set(true);
    } catch (err) {
      // Erros de leitura da planilha já vêm com texto próprio (sem resposta da API).
      this.toast.error(
        err instanceof Error &&
          !isNoResponseError(err) &&
          !('status' in err) &&
          !('response' in err)
          ? err.message
          : this.errMsg(err),
      );
    } finally {
      this.importing.set(false);
    }
  }

  /** Categoria do cadastro com o mesmo nome (sem caixa/acento); prefere a do tipo da linha. */
  private canonicalCategory(name: string, type: MovType | null) {
    const active = this.allActiveCategories();
    return (
      (type
        ? matchName(
            name,
            active.filter((c) => c.type === type),
          )
        : null) ?? matchName(name, active)
    );
  }

  /** Categorias que podem ser escolhidas numa linha: as do tipo dela (todas, se ainda sem tipo). */
  importCategoriesFor(row: EditableImportRow) {
    const all = this.allActiveCategories();
    return row.type ? all.filter((c) => c.type === row.type) : all;
  }

  /**
   * Reenviar a mesma planilha duplicaria tudo (a API só barra lançamento igual em menos de 2
   * minutos). Linha igual a uma já lançada — mesma conta, título, valor, data e tipo — vem
   * desmarcada; quem quiser mesmo, marca.
   */
  private flagPossibleDuplicate(row: EditableImportRow): EditableImportRow {
    if (!row.valid) return row;
    const norm = (t: string) => t.trim().toLowerCase();
    const account = this.contasSvc.accounts().find((a) => norm(a.name) === norm(row.accountName));
    const exists =
      !!account &&
      this.svc
        .movements()
        .some(
          (m) =>
            m.accountId === account.id &&
            m.type === row.type &&
            m.value === row.value &&
            m.date === row.date &&
            norm(m.title) === norm(row.title),
        );
    return exists ? { ...row, possibleDuplicate: true, included: false } : row;
  }

  closeImportPreview(): void {
    this.notesOpen.set(new Set());
    this.importPreviewOpen.set(false);
    this.importConfirmWarningOpen.set(false);
    this.importRows.set([]);
  }

  /** Reavalia uma linha editada — recalcula erro/validade e ajusta `included`. */
  private revalidateRow(row: EditableImportRow): EditableImportRow {
    const errors: string[] = [];
    if (!row.type) errors.push('falta o tipo (receita ou despesa)');
    if (!row.title.trim()) errors.push('título vazio');
    else if (row.title.length > this.TITLE_MAX) {
      errors.push(
        `título passa de ${this.TITLE_MAX} caracteres (tem ${row.title.length}): encurte e coloque os detalhes em Observações`,
      );
    }
    if (row.notes && row.notes.length > this.NOTES_MAX) {
      errors.push(
        `observações passam de ${this.NOTES_MAX} caracteres (têm ${row.notes.length}): encurte`,
      );
    }
    if (!(row.value > 0)) errors.push('valor deve ser maior que zero');
    if (!row.date) {
      errors.push(
        row.dateRaw
          ? `data "${row.dateRaw}" inválida (use AAAA-MM-DD ou DD/MM/AAAA)`
          : 'data vazia',
      );
    }
    if (!row.categoryName.trim()) {
      errors.push('falta a categoria');
    } else {
      const sameName = this.allActiveCategories().filter(
        (c) => c.name.trim().toLowerCase() === row.categoryName.trim().toLowerCase(),
      );
      if (sameName.length === 0) {
        errors.push(`categoria "${row.categoryName}" não encontrada`);
      } else if (row.type && !sameName.some((c) => c.type === row.type)) {
        // A API recusa categoria de tipo diferente do lançamento.
        const doTipo = row.type === 'income' ? 'despesa' : 'receita';
        errors.push(`categoria "${row.categoryName}" é de ${doTipo}, mas a linha é do outro tipo`);
      }
    }
    if (!row.accountName.trim()) {
      errors.push('falta a conta');
    } else if (
      !this.accounts().some(
        (a) => a.name.trim().toLowerCase() === row.accountName.trim().toLowerCase(),
      )
    ) {
      errors.push(`conta "${row.accountName}" não encontrada`);
    }
    if (!row.paymentMethod) errors.push('falta a forma de pagamento');
    if (!row.status) errors.push('falta o status');

    const valid = errors.length === 0;
    return {
      ...row,
      valid,
      error: valid ? null : errors.join('; '),
      // Corrigiu a linha agora? marca pra incluir automaticamente. Continuava inválida? não dá pra incluir.
      included: valid ? (row.valid ? row.included : true) : false,
    };
  }

  updateRowField<K extends keyof EditableImportRow>(
    index: number,
    field: K,
    value: EditableImportRow[K],
  ): void {
    this.importRows.update((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        // Escolheu a data na tela: o texto que a planilha trazia deixa de valer.
        const next = field === 'date' ? { ...r, dateRaw: undefined } : r;
        return this.revalidateRow({ ...next, [field]: value });
      }),
    );
  }

  /**
   * Preenche de uma vez o campo em branco de todas as linhas (útil quando a planilha não traz uma
   * coluna inteira). Só mexe em linha em que o campo está vazio: o que veio da planilha não muda.
   */
  fillBlank(
    field: 'type' | 'categoryName' | 'accountName' | 'paymentMethod' | 'status',
    raw: string,
  ): void {
    if (!raw) return;
    this.importRows.update((rows) =>
      rows.map((r) => {
        const blank = !r[field];
        if (!blank) return r;
        if (field === 'categoryName') {
          // Categoria só serve se for do tipo da linha.
          const c = this.canonicalCategory(raw, r.type);
          return c && (!r.type || c.type === r.type)
            ? this.revalidateRow({ ...r, categoryName: c.name })
            : r;
        }
        if (field === 'status') {
          // "Concluído" vira Recebido em entrada e Pago em saída.
          const status =
            raw === 'settled'
              ? r.type === 'income'
                ? 'received'
                : r.type === 'expense'
                  ? 'paid'
                  : null
              : (raw as MovStatus);
          return status ? this.revalidateRow({ ...r, status }) : r;
        }
        return this.revalidateRow({ ...r, [field]: raw } as EditableImportRow);
      }),
    );
  }

  /** Quantas linhas ainda têm esse campo em branco (mostra/esconde a barra de preenchimento). */
  blankCount(field: 'type' | 'categoryName' | 'accountName' | 'paymentMethod' | 'status'): number {
    return this.importRows().filter((r) => !r[field]).length;
  }

  /** Digitou no campo Valor da revisão: guarda o texto como está (já com máscara) e o número lido dele. */
  setRowValue(index: number, text: string): void {
    this.importRows.update((rows) =>
      rows.map((r, i) =>
        i === index ? this.revalidateRow({ ...r, valueText: text, value: parseNumberBR(text) }) : r,
      ),
    );
  }

  /** Saiu do campo: o texto fecha com ",00" (o número não muda). */
  padRowValue(index: number): void {
    this.importRows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, valueText: padMoneyInput(r.valueText) } : r)),
    );
  }

  toggleRowIncluded(index: number, included: boolean): void {
    this.importRows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, included: r.valid ? included : false } : r)),
    );
  }

  categoryMatches(name: string): boolean {
    return this.allActiveCategories().some(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  }

  accountMatches(name: string): boolean {
    return this.accounts().some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());
  }

  /** Se alguma linha ficar de fora, confirma com o usuário antes de gravar. */
  confirmImportPreview(): void {
    if (this.importExcludedCount() > 0) {
      this.importConfirmWarningOpen.set(true);
      return;
    }
    this.doConfirmImport();
  }

  cancelConfirmWarning(): void {
    this.importConfirmWarningOpen.set(false);
  }

  async confirmDespiteExclusions(): Promise<void> {
    this.importConfirmWarningOpen.set(false);
    await this.doConfirmImport();
  }

  private async doConfirmImport(): Promise<void> {
    const items: ImportMovementItem[] = this.importRows()
      .filter((r) => r.included && r.valid)
      .map((r) => ({
        dateRaw: undefined,
        row: r.row,
        type: r.type,
        title: r.title,
        value: r.value,
        date: r.date,
        categoryName: r.categoryName,
        accountName: r.accountName,
        paymentMethod: r.paymentMethod,
        status: r.status,
        notes: r.notes,
        valid: r.valid,
        error: r.error,
      }));
    if (items.length === 0) return;
    this.confirmingImport.set(true);
    try {
      const result = await this.svc.confirmImport(
        items,
        {
          categories: this.categoriasSvc
            .categories()
            .map((c) => ({ id: c.id, name: c.name, type: c.type })),
          accounts: this.contasSvc.accounts().map((a) => ({ id: a.id, name: a.name })),
        },
        (done, total) => this.importProgress.set({ done, total }),
      );
      this.closeImportPreview();
      this.importResult.set(result);
      this.closeModal();
    } catch (err) {
      // Pode ter gravado parte das linhas antes de o erro chegar: atualiza a lista e avisa.
      await this.svc.refresh().catch(() => undefined);
      this.toast.error(
        isNoResponseError(err)
          ? 'A conexão caiu ou demorou demais durante a importação. Atualizei a lista: confira o que já entrou antes de tentar de novo (reenviar as mesmas linhas não duplica).'
          : this.errMsg(err),
      );
    } finally {
      this.confirmingImport.set(false);
      this.importProgress.set(null);
    }
  }

  closeImportResult(): void {
    this.importResult.set(null);
  }

  async save(force = false): Promise<void> {
    if (!this.formValid) return;
    const f = this.form();
    const e = this.editing();

    try {
      if (e) {
        await this.svc.update(e.id, {
          title: f.title.trim(),
          value: parseNumberBR(f.value) || 0,
          date: f.date,
          categoryId: f.categoryId!,
          accountId: f.accountId!,
          paymentMethod: f.paymentMethod as PaymentMethod,
          notes: f.notes || null,
        });
        this.toast.success('Movimentação atualizada.');
        this.editing.set(null);
      } else {
        await this.svc.register(
          {
            type: f.type,
            title: f.title.trim(),
            value: parseNumberBR(f.value) || 0,
            date: f.date,
            categoryId: f.categoryId!,
            accountId: f.accountId!,
            paymentMethod: f.paymentMethod as PaymentMethod,
            status: f.status,
            notes: f.notes || null,
          },
          force,
        );
        this.toast.success('Movimentação criada com sucesso.');
        this.creating.set(false);
      }
      this.duplicate.set(false);
      this.pendingForm.set(null);
    } catch (err) {
      if (err instanceof DuplicateMovementError) {
        this.duplicate.set(true);
        this.pendingForm.set(f);
        return;
      }
      this.toast.error(this.errMsg(err));
    }
  }

  async saveForced(): Promise<void> {
    await this.save(true);
  }

  async changeStatus(m: Movement, status: MovStatus): Promise<void> {
    try {
      await this.svc.changeStatus(m.id, status);
      if (this.details()?.id === m.id) this.details.update((d) => (d ? { ...d, status } : d));
      this.toast.info(`Status alterado para "${STATUS_META[status].label}".`);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    }
  }

  statusActions(m: Movement): { label: string; status: MovStatus; icon: string }[] {
    const all: Record<MovStatus, { label: string; status: MovStatus; icon: string }> = {
      pending: { label: 'Marcar como pendente', status: 'pending', icon: 'schedule' },
      received: { label: 'Confirmar recebimento', status: 'received', icon: 'check_circle' },
      paid: { label: 'Confirmar pagamento', status: 'paid', icon: 'check_circle' },
      cancelled: { label: 'Cancelar', status: 'cancelled', icon: 'cancel' },
    };
    return (
      m.type === 'income'
        ? (['received', 'pending', 'cancelled'] as MovStatus[])
        : (['paid', 'pending', 'cancelled'] as MovStatus[])
    )
      .filter((s) => s !== m.status)
      .map((s) => all[s]);
  }
}
