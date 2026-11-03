import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CategoriasService,
  Category,
  CatType,
  Behavior,
  Nature,
  DreGroupKey,
} from '../../services/categorias.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { ToggleComponent } from '../../shared/toggle.component';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FilterBarComponent, FilterSelectComponent } from '../../shared/filter-bar.component';
import { AuditTimelineComponent } from '../../shared/audit-timeline.component';
import { ToastService } from '../../shared/toast.service';
import { apiErrorMessage } from '../../shared/api-error-message';
import { fmtDateTime } from '../../shared/format';
import { dreGroupOptionsFor, dreGroupShort, sugereCmv } from '../../shared/dre-group';

interface CatForm {
  name: string;
  type: CatType;
  behavior: Behavior;
  nature: Nature;
  /** Onde a despesa entra no resultado (CMV, mão de obra, despesa operacional). Só em despesa. */
  dreGroup: DreGroupKey;
  active: boolean;
}

@Component({
  selector: 'app-categorias',
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
  templateUrl: './categorias.component.html',
})
export class CategoriasComponent implements OnInit {
  private svc = inject(CategoriasService);
  private toast = inject(ToastService);

  protected tab = signal<CatType>('income');
  protected creating = signal(false);
  protected editing = signal<Category | null>(null);
  protected details = signal<Category | null>(null);
  protected protectedAlert = signal<Category | null>(null);
  protected query = signal('');
  protected behaviorFilter = signal<'all' | Behavior>('all');
  protected natureFilter = signal<'all' | Nature>('all');
  protected statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  protected dreFilter = signal<'all' | DreGroupKey>('all');
  /** A pessoa escolheu o grupo na mão: a sugestão pelo nome para de mexer nele. */
  protected dreTouched = signal(false);

  protected form = signal<CatForm>({
    name: '',
    type: 'income',
    behavior: 'variable',
    nature: 'operational',
    dreGroup: 'opex',
    active: true,
  });

  protected categories = this.svc.categories;
  protected loading = this.svc.loading;
  protected fmtDate = fmtDateTime;

  protected activeFilters = computed(
    () =>
      (this.behaviorFilter() !== 'all' ? 1 : 0) +
      (this.natureFilter() !== 'all' ? 1 : 0) +
      (this.statusFilter() !== 'all' ? 1 : 0) +
      (this.tab() === 'expense' && this.dreFilter() !== 'all' ? 1 : 0),
  );

  protected dreOptions = computed(() => dreGroupOptionsFor(this.form().dreGroup));

  /**
   * Aviso sob o seletor: 'auto' = o grupo veio da sugestão pelo nome (criando); 'parece' = o nome
   * parece ingrediente mas o grupo ainda é despesa operacional (criando ou editando).
   */
  protected dreHint = computed<'auto' | 'parece' | null>(() => {
    const f = this.form();
    if (f.type !== 'expense' || !sugereCmv(f.name)) return null;
    if (f.dreGroup === 'cmv') return this.dreTouched() || this.editing() ? null : 'auto';
    return f.dreGroup === 'opex' ? 'parece' : null;
  });

  protected filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.categories()
      .filter((c) => {
        if (c.type !== this.tab()) return false;
        if (q && !c.name.toLowerCase().includes(q)) return false;
        if (this.behaviorFilter() !== 'all' && c.behavior !== this.behaviorFilter()) return false;
        if (this.natureFilter() !== 'all' && c.nature !== this.natureFilter()) return false;
        if (this.statusFilter() === 'active' && !c.active) return false;
        if (this.statusFilter() === 'inactive' && c.active) return false;
        if (
          this.tab() === 'expense' &&
          this.dreFilter() !== 'all' &&
          (c.dreGroup ?? 'opex') !== this.dreFilter()
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        if (a.protected !== b.protected) return a.protected ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  });

  protected incomeCount = computed(
    () => this.categories().filter((c) => c.type === 'income' && c.active).length,
  );
  protected expenseCount = computed(
    () => this.categories().filter((c) => c.type === 'expense' && c.active).length,
  );

  ngOnInit(): void {
    this.svc.refresh().catch((err) => this.toast.error(this.errMsg(err)));
  }

  clearFilters(): void {
    this.behaviorFilter.set('all');
    this.natureFilter.set('all');
    this.statusFilter.set('all');
    this.dreFilter.set('all');
  }

  get nameError(): string {
    const trimmed = this.form().name.trim();
    if (trimmed.length > 0 && trimmed.length < 2) return 'Use pelo menos 2 caracteres.';
    if (trimmed.length >= 2) {
      const e = this.editing();
      const dup = this.categories().some(
        (c) =>
          c.id !== e?.id &&
          c.type === this.form().type &&
          c.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (dup) return 'Já existe uma categoria com esse nome para este tipo.';
    }
    return '';
  }

  get saveDisabled(): boolean {
    return !this.form().name.trim() || !!this.nameError;
  }

  openCreate(): void {
    this.form.set({
      name: '',
      type: this.tab(),
      behavior: 'variable',
      nature: 'operational',
      dreGroup: 'opex',
      active: true,
    });
    this.dreTouched.set(false);
    this.creating.set(true);
  }

  openEdit(c: Category): void {
    if (c.protected) {
      this.protectedAlert.set(c);
      return;
    }
    this.form.set({
      name: c.name,
      type: c.type,
      behavior: c.behavior,
      nature: c.nature,
      dreGroup: c.dreGroup ?? 'opex',
      active: c.active,
    });
    // Categoria que já existe: nada muda sozinho, só aparece o aviso quando o nome parece insumo.
    this.dreTouched.set(true);
    this.editing.set(c);
  }

  closeModal(): void {
    this.creating.set(false);
    this.editing.set(null);
  }

  setField<K extends keyof CatForm>(k: K, v: CatForm[K]): void {
    this.form.update((f) => ({ ...f, [k]: v }));
    // Cadastro novo de despesa: o nome sugere o grupo (ingrediente -> CMV) até a pessoa escolher.
    if ((k === 'name' || k === 'type') && !this.editing() && !this.dreTouched()) {
      this.form.update((f) => ({
        ...f,
        dreGroup: f.type === 'expense' && sugereCmv(f.name) ? 'cmv' : 'opex',
      }));
    }
  }

  setDreGroup(g: DreGroupKey): void {
    this.dreTouched.set(true);
    this.setField('dreGroup', g);
  }

  dreLabel(c: Category): string {
    return dreGroupShort(c.dreGroup);
  }

  private errMsg(err: unknown): string {
    return apiErrorMessage(err);
  }

  async save(): Promise<void> {
    if (this.saveDisabled) return;
    const f = this.form();
    const e = this.editing();
    if (e) {
      try {
        await this.svc.update(e.id, {
          name: f.name.trim(),
          type: f.type,
          behavior: f.behavior,
          nature: f.nature,
          ...(f.type === 'expense' ? { dreGroup: f.dreGroup } : {}),
        });
        // Ativação/desativação usa as rotas dedicadas (auditadas no servidor).
        if (e.active && !f.active) await this.svc.inactivate(e.id);
        if (!e.active && f.active) await this.svc.reactivate(e.id);
        this.toast.success('Categoria atualizada.');
        this.editing.set(null);
      } catch (err) {
        this.toast.error(this.errMsg(err));
      }
    } else {
      try {
        await this.svc.create({
          name: f.name.trim(),
          type: f.type,
          behavior: f.behavior,
          nature: f.nature,
          ...(f.type === 'expense' ? { dreGroup: f.dreGroup } : {}),
        });
        this.toast.success('Categoria criada com sucesso.');
        this.creating.set(false);
      } catch (err) {
        this.toast.error(this.errMsg(err));
      }
    }
  }

  async handleToggle(c: Category, v: boolean): Promise<void> {
    if (c.protected) {
      this.protectedAlert.set(c);
      return;
    }
    try {
      if (v) {
        await this.svc.reactivate(c.id);
      } else {
        await this.svc.inactivate(c.id);
      }
      this.toast.show(v ? 'success' : 'info', `${c.name} ${v ? 'reativada' : 'inativada'}.`);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    }
  }

  behaviorLabel(b: Behavior): string {
    return b === 'fixed' ? 'Fixo' : b === 'mixed' ? 'Misto' : 'Variável';
  }
  natureLabel(n: Nature): string {
    return n === 'operational' ? 'Operacional' : 'Não operacional';
  }

  protected behaviorOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'fixed', label: 'Fixo' },
    { value: 'variable', label: 'Variável' },
    { value: 'mixed', label: 'Misto' },
  ];
  protected natureOpts = [
    { value: 'all', label: 'Todas' },
    { value: 'operational', label: 'Operacional' },
    { value: 'non-operational', label: 'Não operacional' },
  ];
  protected dreFilterOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'cmv', label: 'CMV' },
    { value: 'labor', label: 'Mão de obra' },
    { value: 'opex', label: 'Despesa operacional' },
  ];
  protected statusOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Ativas' },
    { value: 'inactive', label: 'Inativas' },
  ];
}
