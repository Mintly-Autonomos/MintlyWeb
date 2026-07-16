import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MovimentacoesService,
  Movement,
  MovType,
  MovStatus,
  PaymentMethod,
  PAYMENT_METHODS,
  STATUS_META,
  DuplicateMovementError,
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
