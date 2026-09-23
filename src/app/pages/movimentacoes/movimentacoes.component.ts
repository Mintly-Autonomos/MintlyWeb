import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Workbook } from 'exceljs';
import {
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
import { formatBRL, fmtDateTime, fmtShortDate } from '../../shared/format';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type Period = 'all' | 'today' | '7d' | '30d' | 'custom';

const FEE_RATES: Record<string, number> = { iFood: 12, Rappi: 15 };

/** Linha da prévia de importação, editável na tela antes de confirmar. */
interface EditableImportRow {
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
  /** Se vai ser gravada ao confirmar — só pode ser true quando `valid` também é. */
  included: boolean;
  valid: boolean;
  error: string | null;
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
  readonly parseFloat = parseFloat;

  // ── Options ───────────────────────────────────────────────────────────
  protected typeOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'income', label: 'Receita' },
    { value: 'expense', label: 'Despesa' },
  ];
  protected statusOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'received', label: 'Recebido' },
    { value: 'paid', label: 'Pago' },
    { value: 'pending', label: 'Pendente' },
    { value: 'cancelled', label: 'Cancelado' },
  ];
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
    const val = parseFloat(this.form().value) || 0;
    const id = this.form().accountId;
    if (!id || !this.isPlatformAccount) return 0;
    const acc = this.contasSvc.accounts().find((x) => x.id === id);
    const rate = acc?.taxPct ?? FEE_RATES[acc?.name ?? ''] ?? 0;
    return val * (rate / 100);
  }

  get netValue(): number {
    return (parseFloat(this.form().value) || 0) - this.platformFee;
  }

  get formValid(): boolean {
    const f = this.form();
    return (
      !!f.title.trim() &&
      (parseFloat(f.value) || 0) > 0 &&
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
      const valid: MovStatus[] =
        type === 'income' ? ['received', 'pending', 'cancelled'] : ['paid', 'pending', 'cancelled'];
      return {
        ...f,
        type,
        status: valid.includes(f.status) ? f.status : 'pending',
        // categoria trocou de universo (receita/despesa) — evita mandar um id incompatível.
        categoryId: null,
      };
    });
  }

  private errMsg(err: unknown): string {
    const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
    return data?.message ?? 'Não foi possível concluir a operação. Tente novamente.';
  }

  // ── CRUD ──────────────────────────────────────────────────────────────
  openCreate(): void {
    this.form.set({
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
    this.importMode.set(false);
    this.importFile.set(null);
    this.creating.set(true);
  }

  openEdit(m: Movement): void {
    this.form.set({
      type: m.type,
      title: m.title,
      value: String(m.value),
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
          // Revalida de cara contra categorias/contas reais — o parse só garante formato de célula.
          const revalidated = this.revalidateRow({
            row: item.row,
            type: item.type,
            title: item.title,
            value: item.value,
            date: item.date,
            categoryName: item.categoryName,
            accountName: item.accountName,
            paymentMethod: item.paymentMethod,
            status: item.status,
            notes: item.notes,
            included: item.valid,
            valid: item.valid,
            error: item.error,
          });
          // Problema de formato que o parse pegou (ex.: tipo/status não reconhecido) e que a
          // revalidação não teria como recalcular sozinha (o campo já veio normalizado) — mantém.
          if (!item.valid && revalidated.valid) {
            return { ...revalidated, valid: false, included: false, error: item.error };
          }
          return revalidated;
        }),
      );
      this.importPreviewOpen.set(true);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    } finally {
      this.importing.set(false);
    }
  }

  closeImportPreview(): void {
    this.importPreviewOpen.set(false);
    this.importConfirmWarningOpen.set(false);
    this.importRows.set([]);
  }

  /** Reavalia uma linha editada — recalcula erro/validade e ajusta `included`. */
  private revalidateRow(row: EditableImportRow): EditableImportRow {
    const errors: string[] = [];
    if (!row.title.trim()) errors.push('título vazio');
    if (!(row.value > 0)) errors.push('valor deve ser maior que zero');
    if (!row.date) errors.push('data vazia');
    const categoryOk = this.allActiveCategories().some(
      (c) => c.name.trim().toLowerCase() === row.categoryName.trim().toLowerCase(),
    );
    if (!categoryOk) errors.push(`categoria "${row.categoryName}" não encontrada`);
    const accountOk = this.accounts().some(
      (a) => a.name.trim().toLowerCase() === row.accountName.trim().toLowerCase(),
    );
    if (!accountOk) errors.push(`conta "${row.accountName}" não encontrada`);

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
      rows.map((r, i) => (i === index ? this.revalidateRow({ ...r, [field]: value }) : r)),
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
      const result = await this.svc.confirmImport(items);
      this.closeImportPreview();
      this.importResult.set(result);
      this.closeModal();
    } catch (err) {
      this.toast.error(this.errMsg(err));
    } finally {
      this.confirmingImport.set(false);
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
          value: parseFloat(f.value) || 0,
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
            value: parseFloat(f.value) || 0,
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
