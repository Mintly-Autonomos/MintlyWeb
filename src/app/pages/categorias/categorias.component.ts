import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CategoriasService, Category, CatType, Behavior, Nature, AuditEvent
} from '../../services/categorias.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { ToggleComponent } from '../../shared/toggle.component';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FilterBarComponent } from '../../shared/filter-bar.component';
import { AuditTimelineComponent } from '../../shared/audit-timeline.component';
import { ToastService } from '../../shared/toast.service';
import { fmtDateTime } from '../../shared/format';

const CURRENT_USER = 'Você (Marina S.)';

interface CatForm { name: string; type: CatType; behavior: Behavior; nature: Nature; active: boolean; }

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [FormsModule, IconComponent, ChipComponent, ToggleComponent, ModalComponent, EmptyStateComponent, FilterBarComponent, AuditTimelineComponent],
  templateUrl: './categorias.component.html',
})
export class CategoriasComponent {
  private svc = inject(CategoriasService);
  private toast = inject(ToastService);

  protected tab = signal<CatType>('income');
  protected creating = signal(false);
  protected editing = signal<Category | null>(null);
  protected details = signal<Category | null>(null);
  protected protectedAlert = signal<Category | null>(null);
  protected query = signal('');

  protected form = signal<CatForm>({
    name: '', type: 'income', behavior: 'variable', nature: 'operational', active: true,
  });

  protected categories = this.svc.categories;
  protected fmtDate = fmtDateTime;

  protected filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.categories()
      .filter(c => c.type === this.tab() && (!q || c.name.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.protected !== b.protected) return a.protected ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  });

  protected incomeCount = computed(() => this.categories().filter(c => c.type === 'income' && c.active).length);
  protected expenseCount = computed(() => this.categories().filter(c => c.type === 'expense' && c.active).length);

  get nameError(): string {
    const trimmed = this.form().name.trim();
    if (trimmed.length > 0 && trimmed.length < 2) return 'Use pelo menos 2 caracteres.';
    if (trimmed.length >= 2) {
      const e = this.editing();
      const dup = this.categories().some(c => c.id !== e?.id && c.type === this.form().type && c.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (dup) return 'Já existe uma categoria com esse nome para este tipo.';
    }
    return '';
  }

  get saveDisabled(): boolean { return !this.form().name.trim() || !!this.nameError; }

  openCreate(): void {
    this.form.set({ name: '', type: this.tab(), behavior: 'variable', nature: 'operational', active: true });
    this.creating.set(true);
  }

  openEdit(c: Category): void {
    if (c.protected) { this.protectedAlert.set(c); return; }
    this.form.set({ name: c.name, type: c.type, behavior: c.behavior, nature: c.nature, active: c.active });
    this.editing.set(c);
  }

  closeModal(): void { this.creating.set(false); this.editing.set(null); }

  setField<K extends keyof CatForm>(k: K, v: CatForm[K]): void { this.form.update(f => ({ ...f, [k]: v })); }

  save(): void {
    if (this.saveDisabled) return;
    const f = this.form(); const now = new Date().toISOString();
    const e = this.editing();
    if (e) {
      const evts = this.diffEvents(e, f);
      const updated: Category = { ...e, ...f, name: f.name.trim(), updatedAt: now, updatedBy: CURRENT_USER };
      const withHist = this.appendHistory(updated, evts);
      this.svc.categories.update(all => all.map(c => c.id === e.id ? withHist : c));
      this.toast.success('Categoria atualizada.');
      this.editing.set(null);
    } else {
      const id = Math.max(0, ...this.categories().map(c => c.id)) + 1;
      const created: Category = {
        id, name: f.name.trim(), type: f.type, behavior: f.behavior, nature: f.nature,
        active: f.active, protected: false,
        createdAt: now, updatedAt: now, createdBy: CURRENT_USER, updatedBy: CURRENT_USER,
        history: [{ id: 1, at: now, by: CURRENT_USER, action: 'Categoria criada', icon: 'add_circle' }],
      };
      this.svc.categories.update(all => [...all, created]);
      this.toast.success('Categoria criada com sucesso.');
      this.creating.set(false);
    }
  }

  handleToggle(c: Category, v: boolean): void {
    if (c.protected) { this.protectedAlert.set(c); return; }
    const now = new Date().toISOString();
    const evt = v ? { action: 'Categoria reativada', icon: 'play_circle' } : { action: 'Categoria inativada', icon: 'pause_circle' };
    this.svc.categories.update(all => all.map(x => x.id === c.id ? this.appendHistory({ ...x, active: v, updatedAt: now, updatedBy: CURRENT_USER }, [evt]) : x));
    this.toast.show(v ? 'success' : 'info', `${c.name} ${v ? 'reativada' : 'inativada'}.`);
  }

  private diffEvents(prev: Category, next: CatForm): Omit<AuditEvent, 'id' | 'at' | 'by'>[] {
    const evts: Omit<AuditEvent, 'id' | 'at' | 'by'>[] = [];
    if (prev.name !== next.name.trim()) evts.push({ action: 'Nome alterado', detail: `${prev.name} → ${next.name.trim()}`, icon: 'edit' });
    if (prev.behavior !== next.behavior) evts.push({ action: 'Comportamento alterado', detail: `${prev.behavior} → ${next.behavior}`, icon: 'swap_horiz' });
    if (prev.nature !== next.nature) evts.push({ action: 'Natureza alterada', detail: `${prev.nature} → ${next.nature}`, icon: 'swap_horiz' });
    if (prev.active !== next.active) evts.push({ action: next.active ? 'Categoria reativada' : 'Categoria inativada', icon: next.active ? 'play_circle' : 'pause_circle' });
    return evts;
  }

  private appendHistory(c: Category, events: Omit<AuditEvent, 'id' | 'at' | 'by'>[]): Category {
    if (!events.length) return c;
    const now = new Date().toISOString();
    const start = Math.max(0, ...c.history.map(h => h.id)) + 1;
    const items = events.map((e, i) => ({ ...e, id: start + i, at: now, by: CURRENT_USER }));
    return { ...c, updatedAt: now, updatedBy: CURRENT_USER, history: [...items, ...c.history] };
  }

  behaviorLabel(b: Behavior): string { return b === 'fixed' ? 'Fixo' : 'Variável'; }
  natureLabel(n: Nature): string { return n === 'operational' ? 'Operacional' : 'Não operacional'; }
}
