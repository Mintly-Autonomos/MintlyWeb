import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContasService, Account, AccType, TYPE_META, AuditEvent } from '../../services/contas.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { ToggleComponent } from '../../shared/toggle.component';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FilterBarComponent, FilterSelectComponent } from '../../shared/filter-bar.component';
import { AuditTimelineComponent } from '../../shared/audit-timeline.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, fmtDateTime } from '../../shared/format';

function normalize(s: string): string { return s.trim().toLowerCase().replace(/\s+/g, ' '); }

const CURRENT_USER = 'Você (Marina S.)';

@Component({
  selector: 'app-contas',
  standalone: true,
  imports: [FormsModule, IconComponent, ChipComponent, ToggleComponent, ModalComponent, EmptyStateComponent, FilterBarComponent, FilterSelectComponent, AuditTimelineComponent],
  templateUrl: './contas.component.html',
})
export class ContasComponent {
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
  protected selectedReassignId = signal<number | null>(null);

  // Deferred apply for the "confirm default swap" modal
  private pendingApply: (() => void) | null = null;

  // Form state for modal
  protected form = signal<{
    name: string; type: AccType; active: boolean; isDefault: boolean; taxPct: string; settlementDays: string;
  }>({ name: '', type: 'Bank', active: true, isDefault: false, taxPct: '', settlementDays: '' });

  // Computed
  protected accounts = this.svc.accounts;

  protected activeCount = computed(() => this.accounts().filter(a => a.active).length);
  protected total = computed(() => this.accounts().filter(a => a.active).reduce((s, a) => s + a.balance, 0));
  protected totalPredicted = computed(() => this.accounts().filter(a => a.active).reduce((s, a) => s + a.predictedBalance, 0));

  protected activeFilters = computed(() =>
    (this.typeFilter() !== 'all' ? 1 : 0) + (this.statusFilter() !== 'all' ? 1 : 0)
  );

  protected sorted = computed(() => {
    const cmp = (a: Account, b: Account) => a.name.localeCompare(b.name, 'pt-BR');
    const q = this.query().trim().toLowerCase();
    const matches = this.accounts().filter(a => {
      if (this.typeFilter() !== 'all' && a.type !== this.typeFilter()) return false;
      if (this.statusFilter() === 'active' && !a.active) return false;
      if (this.statusFilter() === 'inactive' && a.active) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...matches.filter(a => a.active).sort(cmp), ...matches.filter(a => !a.active).sort(cmp)];
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

  // Open create/edit modal
  openCreate(): void {
    this.form.set({ name: '', type: 'Bank', active: true, isDefault: false, taxPct: '', settlementDays: '' });
    this.creating.set(true);
  }

  openEdit(a: Account): void {
    this.form.set({
      name: a.name, type: a.type, active: a.active, isDefault: a.isDefault,
      taxPct: a.taxPct != null ? String(a.taxPct) : '',
      settlementDays: a.settlementDays != null ? String(a.settlementDays) : '',
    });
    this.editing.set(a);
  }

  closeModal(): void { this.creating.set(false); this.editing.set(null); }

  // Form computed helpers
  get isPlatform(): boolean { return this.form().type === 'Financial Platform'; }

  get nameError(): string {
    const trimmed = this.form().name.trim();
    if (trimmed.length > 0 && trimmed.length < 3) return 'Use pelo menos 3 caracteres.';
    const editing = this.editing();
    if (trimmed.length >= 3) {
      const dup = this.accounts().some(a => a.id !== editing?.id && a.type === this.form().type && normalize(a.name) === normalize(trimmed));
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
      if (this.activeCount() <= 1 || e.balance !== 0 || e.predictedBalance !== 0 || e.isDefault) return true;
    }
    return false;
  }

  get deactivateReason(): string {
    const f = this.form(); const e = this.editing();
    if (!e || !e.active || f.active) return '';
    if (this.activeCount() <= 1) return 'Esta é a única conta ativa do sistema.';
    if (e.balance !== 0 || e.predictedBalance !== 0) return 'Esta conta possui saldo disponível ou previsto diferente de zero.';
    if (e.isDefault) return 'Conta padrão não pode ser desativada. Defina outra conta como padrão antes.';
    return '';
  }

  setFormType(t: AccType): void { this.form.update(f => ({ ...f, type: t })); }
  setFormName(n: string): void { this.form.update(f => ({ ...f, name: n })); }
  setFormDefault(v: boolean): void { this.form.update(f => ({ ...f, isDefault: v })); }
  setFormActive(v: boolean): void { this.form.update(f => ({ ...f, active: v })); }
  setFormTaxPct(v: string): void { this.form.update(f => ({ ...f, taxPct: v })); }
  setFormDays(v: string): void { this.form.update(f => ({ ...f, settlementDays: v })); }

  save(): void {
    if (this.saveDisabled) return;
    const f = this.form(); const now = new Date().toISOString();
    const e = this.editing();
    if (e) {
      const becomingDefault = !e.isDefault && f.isDefault;
      const currentDefault = this.accounts().find(a => a.isDefault && a.id !== e.id) ?? null;
      const apply = () => {
        const events = this.diffEvents(e, f);
        const updated: Account = { ...e, ...f, name: f.name.trim(), taxPct: this.isPlatform ? Number(f.taxPct) || 0 : undefined, settlementDays: this.isPlatform ? Number(f.settlementDays) || 0 : undefined, updatedAt: now, updatedBy: CURRENT_USER };
        const withHist = this.appendHistory(updated, events);
        this.svc.accounts.update(all => all.map(x => {
          if (x.id === e.id) return withHist;
          if (f.isDefault && x.isDefault) return this.appendHistory({ ...x, isDefault: false }, [{ action: 'Removida como padrão', icon: 'star_border' }]);
          return x;
        }));
        this.toast.success('Conta atualizada.');
        this.editing.set(null);
      };
      if (becomingDefault && currentDefault) {
        this.confirmDefault.set({ next: { ...e, ...f } as unknown as Account, prev: currentDefault });
        this.pendingApply = apply;
        return;
      }
      apply();
    } else {
      const id = Math.max(0, ...this.accounts().map(a => a.id)) + 1;
      const created: Account = {
        id, name: f.name.trim(), type: f.type, active: f.active, isDefault: f.isDefault,
        balance: 0, predictedBalance: 0,
        taxPct: this.isPlatform ? Number(f.taxPct) || 0 : undefined,
        settlementDays: this.isPlatform ? Number(f.settlementDays) || 0 : undefined,
        createdBy: CURRENT_USER, createdAt: now, updatedBy: CURRENT_USER, updatedAt: now,
        history: [{ id: 1, at: now, by: CURRENT_USER, action: 'Conta criada', detail: `Tipo: ${TYPE_META[f.type].label}`, icon: 'add_circle' }],
      };
      this.svc.accounts.update(all => {
        const next = [...all, created];
        if (f.isDefault) {
          return next.map(x => x.id === id ? x : x.isDefault ? this.appendHistory({ ...x, isDefault: false }, [{ action: 'Removida como padrão', icon: 'star_border' }]) : x);
        }
        return next;
      });
      this.toast.success('Conta criada com sucesso.');
      this.creating.set(false);
    }
  }

  handleToggle(a: Account, v: boolean): void {
    if (v) {
      this.svc.accounts.update(all => all.map(x => x.id === a.id ? this.appendHistory({ ...x, active: true }, [{ action: 'Conta reativada', icon: 'play_circle' }]) : x));
      this.toast.success(`${a.name} foi reativada.`);
      return;
    }
    if (this.activeCount() <= 1) { this.toast.error('Não é possível desativar a única conta ativa do sistema.'); return; }
    if (a.balance !== 0 || a.predictedBalance !== 0) { this.blocked.set(a); return; }
    if (a.isDefault) { this.reassign.set(a); this.selectedReassignId.set(null); return; }
    this.svc.accounts.update(all => all.map(x => x.id === a.id ? this.appendHistory({ ...x, active: false }, [{ action: 'Conta inativada', icon: 'pause_circle' }]) : x));
    this.toast.info(`${a.name} foi desativada.`);
  }

  confirmReassign(): void {
    const target = this.reassign(); const newId = this.selectedReassignId();
    if (!target || !newId) return;
    this.svc.accounts.update(all => all.map(x => {
      if (x.id === target.id) return this.appendHistory({ ...x, isDefault: false, active: false }, [{ action: 'Removida como padrão', icon: 'star_border' }, { action: 'Conta inativada', icon: 'pause_circle' }]);
      if (x.id === newId) return this.appendHistory({ ...x, isDefault: true }, [{ action: 'Definida como padrão', icon: 'star' }]);
      return x;
    }));
    this.toast.info(`${target.name} desativada. Nova conta padrão definida.`);
    this.reassign.set(null);
  }

  applyDefault(): void {
    this.pendingApply?.();
    this.pendingApply = null;
    this.confirmDefault.set(null);
  }

  toggleDisabled(a: Account): boolean {
    return a.active && (this.activeCount() <= 1 || a.balance !== 0 || a.predictedBalance !== 0 || a.isDefault);
  }

  toggleReason(a: Account): string {
    if (!a.active) return '';
    if (this.activeCount() <= 1) return 'Esta é a única conta ativa. Crie ou ative outra conta antes de desativá-la.';
    if (a.balance !== 0 || a.predictedBalance !== 0) return 'Esta conta possui saldo vinculado. Zere os valores antes de desativá-la.';
    if (a.isDefault) return 'Conta padrão não pode ser desativada diretamente. Defina outra conta como padrão primeiro.';
    return '';
  }

  getDetails(a: Account): Account { return this.accounts().find(x => x.id === a.id) ?? a; }

  reassignCandidates(): Account[] { return this.accounts().filter(a => a.active && !a.isDefault); }

  private diffEvents(prev: Account, next: { name: string; active: boolean; isDefault: boolean; taxPct: string; settlementDays: string }): Omit<AuditEvent, 'id' | 'at' | 'by'>[] {
    const evts: Omit<AuditEvent, 'id' | 'at' | 'by'>[] = [];
    if (prev.name !== next.name.trim()) evts.push({ action: 'Nome alterado', detail: `${prev.name} → ${next.name.trim()}`, icon: 'edit' });
    if (prev.active !== next.active) evts.push({ action: next.active ? 'Conta reativada' : 'Conta inativada', icon: next.active ? 'play_circle' : 'pause_circle' });
    if (prev.isDefault !== next.isDefault) evts.push({ action: next.isDefault ? 'Definida como padrão' : 'Removida como padrão', icon: 'star' });
    const newTax = Number(next.taxPct) || 0;
    if ((prev.taxPct ?? 0) !== newTax) evts.push({ action: 'Taxa alterada', detail: `${prev.taxPct ?? 0}% → ${newTax}%`, icon: 'percent' });
    const newDays = Number(next.settlementDays) || 0;
    if ((prev.settlementDays ?? 0) !== newDays) evts.push({ action: 'Prazo de repasse alterado', detail: `${prev.settlementDays ?? 0} dias → ${newDays} dias`, icon: 'schedule' });
    return evts;
  }

  private appendHistory(a: Account, events: Omit<AuditEvent, 'id' | 'at' | 'by'>[]): Account {
    if (!events.length) return a;
    const now = new Date().toISOString();
    const start = Math.max(0, ...a.history.map(h => h.id)) + 1;
    const items = events.map((e, i) => ({ ...e, id: start + i, at: now, by: CURRENT_USER }));
    return { ...a, updatedAt: now, updatedBy: CURRENT_USER, history: [...items, ...a.history] };
  }

}
