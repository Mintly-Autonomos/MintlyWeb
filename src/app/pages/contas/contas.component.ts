import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ContasService,
  Account,
  AccType,
  TYPE_META,
  UpdateAccountInput,
} from '../../services/contas.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { ToggleComponent } from '../../shared/toggle.component';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FilterBarComponent, FilterSelectComponent } from '../../shared/filter-bar.component';
import { AuditTimelineComponent } from '../../shared/audit-timeline.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, fmtDateTime } from '../../shared/format';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

@Component({
  selector: 'app-contas',
  standalone: true,
  imports: [
    FormsModule,
    IconComponent,
    ChipComponent,
    ToggleComponent,
    ModalComponent,
    EmptyStateComponent,
    FilterBarComponent,
    FilterSelectComponent,
    AuditTimelineComponent,
  ],
  templateUrl: './contas.component.html',
})
export class ContasComponent implements OnInit {
  private svc = inject(ContasService);
  private toast = inject(ToastService);

  // State
  protected editing = signal<Account | null>(null);
  protected creating = signal(false);
  protected blocked = signal<Account | null>(null);
  protected reassign = signal<Account | null>(null);
  protected confirmDefault = signal<{ next: Account; prev: Account | null } | null>(null);
  protected details = signal<Account | null>(null);
  protected query = signal('');
  protected typeFilter = signal<'all' | AccType>('all');
  protected statusFilter = signal<'all' | 'active' | 'inactive'>('all');

  // Reassign selection
  protected selectedReassignId = signal<string | null>(null);

  // Deferred apply for the "confirm default swap" modal
  private pendingApply: (() => Promise<void>) | null = null;

  // Form state for modal
  protected form = signal<{
    name: string;
    type: AccType;
    active: boolean;
    isDefault: boolean;
    taxPct: string;
    settlementDays: string;
  }>({ name: '', type: 'Bank', active: true, isDefault: false, taxPct: '', settlementDays: '' });

  // Computed
  protected accounts = this.svc.accounts;
  protected loading = this.svc.loading;

  protected activeCount = computed(() => this.accounts().filter((a) => a.active).length);
  protected total = computed(() =>
    this.accounts()
      .filter((a) => a.active)
      .reduce((s, a) => s + a.balance, 0),
  );
  protected totalPredicted = computed(() =>
    this.accounts()
      .filter((a) => a.active)
      .reduce((s, a) => s + a.predictedBalance, 0),
  );

  protected activeFilters = computed(
    () => (this.typeFilter() !== 'all' ? 1 : 0) + (this.statusFilter() !== 'all' ? 1 : 0),
  );

  protected sorted = computed(() => {
    const cmp = (a: Account, b: Account) => a.name.localeCompare(b.name, 'pt-BR');
    const q = this.query().trim().toLowerCase();
    const matches = this.accounts().filter((a) => {
      if (this.typeFilter() !== 'all' && a.type !== this.typeFilter()) return false;
      if (this.statusFilter() === 'active' && !a.active) return false;
      if (this.statusFilter() === 'inactive' && a.active) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return [
      ...matches.filter((a) => a.active).sort(cmp),
      ...matches.filter((a) => !a.active).sort(cmp),
    ];
  });

  // Helpers
  protected typeMeta = TYPE_META;
  protected accTypes = Object.keys(TYPE_META) as AccType[];
  protected fmtBRL = formatBRL;
  protected fmtDate = fmtDateTime;

  protected typeOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'Bank', label: 'Banco' },
    { value: 'Cash Register', label: 'Caixa' },
    { value: 'Digital Wallet', label: 'Carteira digital' },
    { value: 'Financial Platform', label: 'Plataforma financeira' },
  ];
  protected statusOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Ativas' },
    { value: 'inactive', label: 'Inativas' },
  ];

  ngOnInit(): void {
    this.svc.refresh().catch((err) => this.toast.error(this.errMsg(err)));
  }

  // Open create/edit modal
  openCreate(): void {
    this.form.set({
      name: '',
      type: 'Bank',
      active: true,
      isDefault: false,
      taxPct: '',
      settlementDays: '',
    });
    this.creating.set(true);
  }

  openEdit(a: Account): void {
    this.form.set({
      name: a.name,
      type: a.type,
      active: a.active,
      isDefault: a.isDefault,
      taxPct: a.taxPct != null ? String(a.taxPct) : '',
      settlementDays: a.settlementDays != null ? String(a.settlementDays) : '',
    });
    this.editing.set(a);
  }

  closeModal(): void {
    this.creating.set(false);
    this.editing.set(null);
  }

  // Form computed helpers
  get isPlatform(): boolean {
    return this.form().type === 'Financial Platform';
  }

  get nameError(): string {
    const trimmed = this.form().name.trim();
    if (trimmed.length > 0 && trimmed.length < 3) return 'Use pelo menos 3 caracteres.';
    const editing = this.editing();
    if (trimmed.length >= 3) {
      const dup = this.accounts().some(
        (a) =>
          a.id !== editing?.id &&
          a.type === this.form().type &&
          normalize(a.name) === normalize(trimmed),
      );
      if (dup) return 'Já existe uma conta com esse nome e tipo. Use uma combinação diferente.';
    }
    return '';
  }

  get saveDisabled(): boolean {
    const f = this.form();
    const trimmed = f.name.trim();
    if (!trimmed || this.nameError) return true;
    const e = this.editing();
    if (e?.isDefault && !f.isDefault) return true;
    if (e && e.active && !f.active) {
      if (this.activeCount() <= 1 || e.balance !== 0 || e.predictedBalance !== 0 || e.isDefault)
        return true;
    }
    return false;
  }

  get deactivateReason(): string {
    const f = this.form();
    const e = this.editing();
    if (!e || !e.active || f.active) return '';
    if (this.activeCount() <= 1) return 'Esta é a única conta ativa do sistema.';
    if (e.balance !== 0 || e.predictedBalance !== 0)
      return 'Esta conta possui saldo disponível ou previsto diferente de zero.';
    if (e.isDefault)
      return 'Conta padrão não pode ser desativada. Defina outra conta como padrão antes.';
    return '';
  }

  setFormType(t: AccType): void {
    this.form.update((f) => ({ ...f, type: t }));
  }
  setFormName(n: string): void {
    this.form.update((f) => ({ ...f, name: n }));
  }
  setFormDefault(v: boolean): void {
    this.form.update((f) => ({ ...f, isDefault: v }));
  }
  setFormActive(v: boolean): void {
    this.form.update((f) => ({ ...f, active: v }));
  }
  setFormTaxPct(v: string): void {
    this.form.update((f) => ({ ...f, taxPct: v }));
  }
  setFormDays(v: string): void {
    this.form.update((f) => ({ ...f, settlementDays: v }));
  }

  private errMsg(err: unknown): string {
    const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
    return data?.message ?? 'Não foi possível concluir a operação. Tente novamente.';
  }

  async save(): Promise<void> {
    if (this.saveDisabled) return;
    const f = this.form();
    const e = this.editing();
    if (e) {
      const becomingDefault = !e.isDefault && f.isDefault;
      const currentDefault = this.accounts().find((a) => a.isDefault && a.id !== e.id) ?? null;
      const apply = async () => {
        try {
          await this.applyEdit(e, f);
          this.toast.success('Conta atualizada.');
          this.editing.set(null);
        } catch (err) {
          this.toast.error(this.errMsg(err));
        }
      };
      if (becomingDefault && currentDefault) {
        this.confirmDefault.set({
          next: { ...e, ...f } as unknown as Account,
          prev: currentDefault,
        });
        this.pendingApply = apply;
        return;
      }
      await apply();
    } else {
      try {
        await this.svc.create({
          name: f.name.trim(),
          type: f.type,
          isDefault: f.isDefault,
          taxPct: this.isPlatform ? Number(f.taxPct) || 0 : undefined,
          settlementDays: this.isPlatform ? Number(f.settlementDays) || 0 : undefined,
        });
        this.toast.success('Conta criada com sucesso.');
        this.creating.set(false);
      } catch (err) {
        this.toast.error(this.errMsg(err));
      }
    }
  }

  /** Aplica edições de campo, e então (se preciso) inativação/definição de padrão. */
  private async applyEdit(
    e: Account,
    f: {
      name: string;
      type: AccType;
      active: boolean;
      isDefault: boolean;
      taxPct: string;
      settlementDays: string;
    },
  ): Promise<void> {
    const patch: UpdateAccountInput = {
      name: f.name.trim(),
      type: f.type,
      taxPct: this.isPlatform ? Number(f.taxPct) || 0 : undefined,
      settlementDays: this.isPlatform ? Number(f.settlementDays) || 0 : undefined,
    };
    // Reativação (false -> true) não tem rota própria: viaja junto do update genérico.
    if (!e.active && f.active) patch.active = true;
    await this.svc.update(e.id, patch);
    // Desativação (true -> false) usa a rota de inativação (guards no servidor).
    if (e.active && !f.active) await this.svc.inactivate(e.id);
    if (!e.isDefault && f.isDefault) await this.svc.setDefault(e.id);
  }

  async handleToggle(a: Account, v: boolean): Promise<void> {
    if (v) {
      try {
        await this.svc.update(a.id, { active: true });
        this.toast.success(`${a.name} foi reativada.`);
      } catch (err) {
        this.toast.error(this.errMsg(err));
      }
      return;
    }
    if (this.activeCount() <= 1) {
      this.toast.error('Não é possível desativar a única conta ativa do sistema.');
      return;
    }
    if (a.balance !== 0 || a.predictedBalance !== 0) {
      this.blocked.set(a);
      return;
    }
    if (a.isDefault) {
      this.reassign.set(a);
      this.selectedReassignId.set(null);
      return;
    }
    try {
      await this.svc.inactivate(a.id);
      this.toast.info(`${a.name} foi desativada.`);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    }
  }

  async confirmReassign(): Promise<void> {
    const target = this.reassign();
    const newId = this.selectedReassignId();
    if (!target || !newId) return;
    try {
      await this.svc.inactivate(target.id, newId);
      this.toast.info(`${target.name} desativada. Nova conta padrão definida.`);
      this.reassign.set(null);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    }
  }

  async applyDefault(): Promise<void> {
    const fn = this.pendingApply;
    this.pendingApply = null;
    this.confirmDefault.set(null);
    await fn?.();
  }

  toggleDisabled(a: Account): boolean {
    return (
      a.active &&
      (this.activeCount() <= 1 || a.balance !== 0 || a.predictedBalance !== 0 || a.isDefault)
    );
  }

  toggleReason(a: Account): string {
    if (!a.active) return '';
    if (this.activeCount() <= 1)
      return 'Esta é a única conta ativa. Crie ou ative outra conta antes de desativá-la.';
    if (a.balance !== 0 || a.predictedBalance !== 0)
      return 'Esta conta possui saldo vinculado. Zere os valores antes de desativá-la.';
    if (a.isDefault)
      return 'Conta padrão não pode ser desativada diretamente. Defina outra conta como padrão primeiro.';
    return '';
  }

  getDetails(a: Account): Account {
    return this.accounts().find((x) => x.id === a.id) ?? a;
  }

  reassignCandidates(): Account[] {
    return this.accounts().filter((a) => a.active && !a.isDefault);
  }
}
