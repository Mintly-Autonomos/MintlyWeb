import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MovimentacoesService, Movement, MovType, MovStatus, PaymentMethod,
  MOV_ACCOUNTS, MOV_CATEGORIES, PAYMENT_METHODS, STATUS_META
} from '../../services/movimentacoes.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FilterBarComponent, FilterSelectComponent, FilterDateRangeComponent } from '../../shared/filter-bar.component';
import { ContasService } from '../../services/contas.service';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, fmtDateTime, fmtShortDate } from '../../shared/format';

function isoToday(): string { return new Date().toISOString().slice(0, 10); }
function isoAgo(days: number): string { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

type Period = 'all' | 'today' | '7d' | '30d' | 'custom';

const CURRENT_USER = 'Você (Marina S.)';
const FEE_RATES: Record<string, number> = { iFood: 12, Rappi: 15 };

interface MovForm {
  type: MovType; title: string; value: string; date: string;
  categoryId: number | null; accountId: number | null;
  paymentMethod: PaymentMethod | ''; status: MovStatus; notes: string;
}

@Component({
  selector: 'app-movimentacoes',
  standalone: true,
  imports: [FormsModule, IconComponent, ChipComponent, ModalComponent, EmptyStateComponent, FilterBarComponent, FilterSelectComponent, FilterDateRangeComponent],
  templateUrl: './movimentacoes.component.html',
})
export class MovimentacoesComponent {
  private svc = inject(MovimentacoesService);
  private contasSvc = inject(ContasService);
  private toast = inject(ToastService);

  // ── UI state ──────────────────────────────────────────────────────────
  protected creating = signal(false);
  protected editing = signal<Movement | null>(null);
  protected details = signal<Movement | null>(null);
  protected duplicate = signal<Movement | null>(null);
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
    type: 'income', title: '', value: '', date: isoToday(),
    categoryId: null, accountId: null, paymentMethod: '', status: 'pending', notes: '',
  });

  // ── Data ──────────────────────────────────────────────────────────────
  protected movements = this.svc.movements;
  protected accounts = computed(() => this.contasSvc.accounts().filter(a => a.active));
  protected categories = MOV_CATEGORIES;
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
  protected activeFilters = computed(() =>
    (this.typeFilter() !== 'all' ? 1 : 0) +
    (this.statusFilter() !== 'all' ? 1 : 0) +
    (this.period() !== 'all' ? 1 : 0)
  );

  protected filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const from = this.resolvedFrom();
    const to = this.resolvedTo();
    return this.movements().filter(m => {
      if (this.typeFilter() !== 'all' && m.type !== this.typeFilter()) return false;
      if (this.statusFilter() !== 'all' && m.status !== this.statusFilter()) return false;
      if (from && m.date < from) return false;
      if (to && m.date > to) return false;
      if (q && !m.title.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  });

  protected totalIn = computed(() =>
    this.filtered().filter(m => m.type === 'income' && m.status === 'received').reduce((s, m) => s + m.value, 0)
  );
  protected totalOut = computed(() =>
    this.filtered().filter(m => m.type === 'expense' && m.status === 'paid').reduce((s, m) => s + m.value, 0)
  );
  protected totalPending = computed(() =>
    this.filtered().filter(m => m.status === 'pending').reduce((s, m) => s + (m.type === 'income' ? m.value : -m.value), 0)
  );

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
    const a = this.contasSvc.accounts().find(x => x.id === id);
    return a?.type === 'Financial Platform';
  }

  get platformFee(): number {
    const val = parseFloat(this.form().value) || 0;
    const id = this.form().accountId;
    if (!id || !this.isPlatformAccount) return 0;
    const acc = this.contasSvc.accounts().find(x => x.id === id);
    const rate = acc?.taxPct ?? FEE_RATES[acc?.name ?? ''] ?? 0;
    return val * (rate / 100);
  }

  get netValue(): number {
    return (parseFloat(this.form().value) || 0) - this.platformFee;
  }

  get formValid(): boolean {
    const f = this.form();
    return !!f.title.trim() && (parseFloat(f.value) || 0) > 0 && !!f.date && !!f.accountId;
  }

  categoryName(id: number | null): string {
    return MOV_CATEGORIES.find(c => c.id === id)?.name ?? '—';
  }
  accountName(id: number | null): string {
    return this.contasSvc.accounts().find(a => a.id === id)?.name ?? '—';
  }

  setFormField<K extends keyof MovForm>(k: K, v: MovForm[K]): void {
    this.form.update(f => ({ ...f, [k]: v }));
  }

  /** Switches the movement type, keeping the status valid for the new type. */
  setType(type: MovType): void {
    this.form.update(f => {
      const valid: MovStatus[] = type === 'income'
        ? ['received', 'pending', 'cancelled']
        : ['paid', 'pending', 'cancelled'];
      return { ...f, type, status: valid.includes(f.status) ? f.status : 'pending' };
    });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────
  openCreate(): void {
    this.form.set({ type: 'income', title: '', value: '', date: isoToday(), categoryId: null, accountId: null, paymentMethod: '', status: 'pending', notes: '' });
    this.creating.set(true);
  }

  openEdit(m: Movement): void {
    this.form.set({ type: m.type, title: m.title, value: String(m.value), date: m.date, categoryId: m.categoryId, accountId: m.accountId, paymentMethod: m.paymentMethod ?? '', status: m.status, notes: m.notes ?? '' });
    this.editing.set(m);
  }

  closeModal(): void { this.creating.set(false); this.editing.set(null); this.duplicate.set(null); this.pendingForm.set(null); }

  checkDuplicate(f: MovForm): Movement | null {
    const val = parseFloat(f.value) || 0;
    return this.movements().find(m =>
      m.date === f.date && Math.abs(m.value - val) < 0.01 && m.title.trim().toLowerCase() === f.title.trim().toLowerCase()
    ) ?? null;
  }

  save(force = false): void {
    if (!this.formValid) return;
    const f = this.form(); const now = new Date().toISOString();
    const e = this.editing();

    if (!e && !force) {
      const dup = this.checkDuplicate(f);
      if (dup) { this.duplicate.set(dup); this.pendingForm.set(f); return; }
    }

    if (e) {
      const updated: Movement = { ...e, ...f, value: parseFloat(f.value) || 0, paymentMethod: f.paymentMethod || null, notes: f.notes || null, updatedAt: now, updatedBy: CURRENT_USER };
      this.svc.movements.update(all => all.map(x => x.id === e.id ? updated : x));
      this.toast.success('Movimentação atualizada.');
      this.editing.set(null);
    } else {
      const id = Math.max(0, ...this.movements().map(m => m.id)) + 1;
      const created: Movement = { id, ...f, value: parseFloat(f.value) || 0, paymentMethod: f.paymentMethod || null, notes: f.notes || null, createdAt: now, updatedAt: now, createdBy: CURRENT_USER, updatedBy: CURRENT_USER };
      this.svc.movements.update(all => [created, ...all]);
      this.toast.success('Movimentação criada com sucesso.');
      this.creating.set(false);
    }
    this.duplicate.set(null); this.pendingForm.set(null);
  }

  saveForced(): void { this.save(true); }

  changeStatus(m: Movement, status: MovStatus): void {
    const now = new Date().toISOString();
    this.svc.movements.update(all => all.map(x => x.id === m.id ? { ...x, status, updatedAt: now, updatedBy: CURRENT_USER } : x));
    if (this.details()?.id === m.id) this.details.update(d => d ? { ...d, status } : d);
    this.toast.info(`Status alterado para "${STATUS_META[status].label}".`);
  }

  statusActions(m: Movement): { label: string; status: MovStatus; icon: string }[] {
    const all: Record<MovStatus, { label: string; status: MovStatus; icon: string }> = {
      pending: { label: 'Marcar como pendente', status: 'pending', icon: 'schedule' },
      received: { label: 'Confirmar recebimento', status: 'received', icon: 'check_circle' },
      paid: { label: 'Confirmar pagamento', status: 'paid', icon: 'check_circle' },
      cancelled: { label: 'Cancelar', status: 'cancelled', icon: 'cancel' },
    };
    return (m.type === 'income'
      ? ['received', 'pending', 'cancelled'] as MovStatus[]
      : ['paid', 'pending', 'cancelled'] as MovStatus[]
    ).filter(s => s !== m.status).map(s => all[s]);
  }

}
