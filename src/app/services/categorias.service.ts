import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  CategoryType,
  CategoryBehavior,
  OperationalNature,
  DreGroup,
  RecordStatus,
} from 'mintly-lib';
import type { FinancialCategory, Headers, Subcategory as LibSubcategory } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { MintlyClientService } from './mintly-client.service';
import mockCategories from '../mocks/mock_categories.json';

export type CatType = 'income' | 'expense';
export type Behavior = 'fixed' | 'variable' | 'mixed';
export type Nature = 'operational' | 'non-operational';
/** Classificação contábil da despesa no DRE — só existe em categoria de despesa. */
export type DreGroupKey = 'cmv' | 'labor' | 'tax' | 'opex';

export interface AuditEvent {
  id: number;
  at: string;
  by: string;
  action: string;
  detail?: string;
  icon: string;
}

export interface Subcategory {
  id: string;
  name: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: CatType;
  behavior: Behavior;
  nature: Nature;
  /** Só em despesa (sem valor -> servidor assume 'opex'). Ausente em receita. */
  dreGroup?: DreGroupKey;
  subcategories: Subcategory[];
  active: boolean;
  protected?: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  history: AuditEvent[];
}

const TYPE_TO_LIB: Record<CatType, CategoryType> = {
  income: CategoryType.Revenue,
  expense: CategoryType.Expense,
};
const TYPE_FROM_LIB: Record<CategoryType, CatType> = {
  [CategoryType.Revenue]: 'income',
  [CategoryType.Expense]: 'expense',
};

const BEHAVIOR_TO_LIB: Record<Behavior, CategoryBehavior> = {
  fixed: CategoryBehavior.Fixed,
  variable: CategoryBehavior.Variable,
  mixed: CategoryBehavior.Mixed,
};
const BEHAVIOR_FROM_LIB: Record<CategoryBehavior, Behavior> = {
  [CategoryBehavior.Fixed]: 'fixed',
  [CategoryBehavior.Variable]: 'variable',
  [CategoryBehavior.Mixed]: 'mixed',
};

const NATURE_TO_LIB: Record<Nature, OperationalNature> = {
  operational: OperationalNature.Operational,
  'non-operational': OperationalNature.NonOperational,
};
const NATURE_FROM_LIB: Record<OperationalNature, Nature> = {
  [OperationalNature.Operational]: 'operational',
  [OperationalNature.NonOperational]: 'non-operational',
};

const DREGROUP_TO_LIB: Record<DreGroupKey, DreGroup> = {
  cmv: DreGroup.Cmv,
  labor: DreGroup.Labor,
  tax: DreGroup.Tax,
  opex: DreGroup.Opex,
};
const DREGROUP_FROM_LIB: Record<DreGroup, DreGroupKey> = {
  [DreGroup.Cmv]: 'cmv',
  [DreGroup.Labor]: 'labor',
  [DreGroup.Tax]: 'tax',
  [DreGroup.Opex]: 'opex',
};

function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Ícone por ação de histórico (mesmas ações reais gravadas pelo servidor: inactivate/reactivate). */
function actionIcon(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('inactivate') || a.includes('inativa')) return 'pause_circle';
  if (a.includes('reactivate') || a.includes('reativa')) return 'play_circle';
  if (a.includes('name') || a.includes('nome')) return 'edit';
  if (a.includes('behavior') || a.includes('comportamento')) return 'swap_horiz';
  if (a.includes('nature') || a.includes('natureza')) return 'swap_horiz';
  if (a.includes('create') || a.includes('criada')) return 'add_circle';
  return 'history';
}

function toSubcategory(raw: LibSubcategory): Subcategory {
  return { id: raw._id, name: raw.name, active: raw.status === RecordStatus.Active };
}

/** Converte a entity da lib (FinancialCategory) para o shape que a tela usa. */
function toCategory(raw: FinancialCategory): Category {
  const audit = raw.audit as unknown as {
    createdAt?: unknown;
    updatedAt?: unknown;
    createdBy?: string;
    updatedBy?: string;
  };
  const rawHistory = (raw.history ?? []) as {
    at: unknown;
    by: string;
    action: string;
    detail?: string;
  }[];
  const dreGroup =
    'dreGroup' in raw ? DREGROUP_FROM_LIB[(raw as { dreGroup: DreGroup }).dreGroup] : undefined;
  return {
    id: (raw._id ?? raw.id) as string,
    name: raw.name,
    type: TYPE_FROM_LIB[raw.type],
    behavior: BEHAVIOR_FROM_LIB[raw.behavior],
    nature: NATURE_FROM_LIB[raw.operationalNature],
    dreGroup,
    subcategories: (raw.subcategories ?? []).map(toSubcategory),
    active: raw.status === RecordStatus.Active,
    protected: raw.isSystem,
    createdBy: audit?.createdBy ?? '—',
    createdAt: toISO(audit?.createdAt),
    updatedBy: audit?.updatedBy ?? '—',
    updatedAt: toISO(audit?.updatedAt),
    history: rawHistory
      .slice()
      .reverse()
      .map((h, i) => ({
        id: i + 1,
        at: toISO(h.at),
        by: h.by,
        action: h.action,
        detail: h.detail,
        icon: actionIcon(h.action),
      })),
  };
}

export interface CreateCategoryInput {
  name: string;
  type: CatType;
  behavior: Behavior;
  nature: Nature;
  /** Só considerado quando `type === 'expense'`; sem valor, o servidor assume 'opex'. */
  dreGroup?: DreGroupKey;
}

export interface UpdateCategoryInput {
  name?: string;
  type?: CatType;
  behavior?: Behavior;
  nature?: Nature;
  dreGroup?: DreGroupKey;
}

function delay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockSeed(): Category[] {
  return (mockCategories as Category[]).map((c) => ({
    ...c,
    subcategories: [...c.subcategories],
    history: [...c.history],
  }));
}

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private categoryClient = inject(MintlyClientService).client.financialCategoryClient;

  /** Seed do modo mock (`environment.useMocks: true`, só local) — sem efeito quando false. */
  private mockStore: Category[] = mockSeed();

  readonly categories = signal<Category[]>([]);
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
    return typeof err === 'object' && err !== null && apiErrorInfo(err).status === 401;
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useMocks) {
        await delay(200);
        this.categories.set(
          this.mockStore.map((c) => ({
            ...c,
            subcategories: [...c.subcategories],
            history: [...c.history],
          })),
        );
        return;
      }
      const response = await this.call((headers) =>
        this.categoryClient.findAll({ page: 1, size: 500 }, headers),
      );
      this.categories.set((response.payload ?? []).map(toCategory));
    } finally {
      this.loading.set(false);
    }
  }

  /** audit/restaurantId/isSystem/usage/history/subcategories ficam de fora: o servidor preenche (insert schema dedicado). */
  async create(input: CreateCategoryInput): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const now = new Date().toISOString();
      const category: Category = {
        id: `cat-${Date.now()}`,
        name: input.name,
        type: input.type,
        behavior: input.behavior,
        nature: input.nature,
        dreGroup: input.type === 'expense' ? (input.dreGroup ?? 'opex') : undefined,
        subcategories: [],
        active: true,
        protected: false,
        createdBy: this.by,
        createdAt: now,
        updatedBy: this.by,
        updatedAt: now,
        history: [{ id: 1, at: now, by: this.by, action: 'create', icon: 'add_circle' }],
      };
      this.mockStore.push(category);
      await this.refresh();
      return;
    }

    const body = {
      name: input.name,
      type: TYPE_TO_LIB[input.type],
      behavior: BEHAVIOR_TO_LIB[input.behavior],
      operationalNature: NATURE_TO_LIB[input.nature],
      status: RecordStatus.Active,
      ...(input.type === 'expense' ? { dreGroup: DREGROUP_TO_LIB[input.dreGroup ?? 'opex'] } : {}),
    } as unknown as FinancialCategory;
    await this.call((headers) => this.categoryClient.insert(body, headers));
    await this.refresh();
  }

  /** status não vai aqui de propósito: só muda via inactivate/reactivate (auditado). */
  async update(id: string, input: UpdateCategoryInput): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const cat = this.mockStore.find((c) => c.id === id);
      if (!cat) throw new Error('Categoria não encontrada.');
      const now = new Date().toISOString();
      if (input.name !== undefined) cat.name = input.name;
      if (input.type !== undefined) cat.type = input.type;
      if (input.behavior !== undefined) cat.behavior = input.behavior;
      if (input.nature !== undefined) cat.nature = input.nature;
      if (input.dreGroup !== undefined) cat.dreGroup = input.dreGroup;
      cat.updatedBy = this.by;
      cat.updatedAt = now;
      cat.history = [
        { id: cat.history.length + 1, at: now, by: this.by, action: 'update', icon: 'edit' },
        ...cat.history,
      ];
      await this.refresh();
      return;
    }

    const patch: Partial<FinancialCategory> = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: TYPE_TO_LIB[input.type] } : {}),
      ...(input.behavior !== undefined ? { behavior: BEHAVIOR_TO_LIB[input.behavior] } : {}),
      ...(input.nature !== undefined ? { operationalNature: NATURE_TO_LIB[input.nature] } : {}),
      ...(input.dreGroup !== undefined ? { dreGroup: DREGROUP_TO_LIB[input.dreGroup] } : {}),
    };
    await this.call((headers) => this.categoryClient.update(id, patch, headers));
    await this.refresh();
  }

  async inactivate(id: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      this.mockSetActive(id, false, 'inactivate', 'pause_circle');
      await this.refresh();
      return;
    }
    await this.call((headers) => this.categoryClient.inactivateUpdate(id, headers));
    await this.refresh();
  }

  async reactivate(id: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      this.mockSetActive(id, true, 'reactivate', 'play_circle');
      await this.refresh();
      return;
    }
    await this.call((headers) => this.categoryClient.reactivateUpdate(id, headers));
    await this.refresh();
  }

  /** Cria uma subcategoria (funciona também em categoria de sistema). */
  async addSubcategory(categoryId: string, name: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const cat = this.mockStore.find((c) => c.id === categoryId);
      if (!cat) throw new Error('Categoria não encontrada.');
      if (cat.subcategories.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Já existe uma subcategoria com esse nome.');
      }
      cat.subcategories.push({ id: `sub-${Date.now()}`, name, active: true });
      await this.refresh();
      return;
    }
    await this.call((headers) => this.categoryClient.addSubcategory(categoryId, { name }, headers));
    await this.refresh();
  }

  /** Renomeia a subcategoria (lançamentos já gravados mantêm o nome antigo). */
  async updateSubcategory(categoryId: string, subcategoryId: string, name: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const sub = this.mockStore
        .find((c) => c.id === categoryId)
        ?.subcategories.find((s) => s.id === subcategoryId);
      if (sub) sub.name = name;
      await this.refresh();
      return;
    }
    await this.call((headers) =>
      this.categoryClient.updateSubcategory(categoryId, subcategoryId, { name }, headers),
    );
    await this.refresh();
  }

  async inactivateSubcategory(categoryId: string, subcategoryId: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const sub = this.mockStore
        .find((c) => c.id === categoryId)
        ?.subcategories.find((s) => s.id === subcategoryId);
      if (sub) sub.active = false;
      await this.refresh();
      return;
    }
    await this.call((headers) =>
      this.categoryClient.inactivateSubcategory(categoryId, subcategoryId, headers),
    );
    await this.refresh();
  }

  async reactivateSubcategory(categoryId: string, subcategoryId: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const sub = this.mockStore
        .find((c) => c.id === categoryId)
        ?.subcategories.find((s) => s.id === subcategoryId);
      if (sub) sub.active = true;
      await this.refresh();
      return;
    }
    await this.call((headers) =>
      this.categoryClient.reactivateSubcategory(categoryId, subcategoryId, headers),
    );
    await this.refresh();
  }

  private mockSetActive(id: string, active: boolean, action: string, icon: string): void {
    const cat = this.mockStore.find((c) => c.id === id);
    if (!cat) return;
    const now = new Date().toISOString();
    cat.active = active;
    cat.updatedBy = this.by;
    cat.updatedAt = now;
    cat.history = [
      { id: cat.history.length + 1, at: now, by: this.by, action, icon },
      ...cat.history,
    ];
  }
}
