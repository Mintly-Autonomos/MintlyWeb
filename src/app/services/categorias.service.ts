import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryType, CategoryBehavior, OperationalNature, RecordStatus } from 'mintly-lib';
import type { FinancialCategory, Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';

export type CatType = 'income' | 'expense';
export type Behavior = 'fixed' | 'variable';
export type Nature = 'operational' | 'non-operational';

export interface AuditEvent {
  id: number;
  at: string;
  by: string;
  action: string;
  detail?: string;
  icon: string;
}

export interface Category {
  id: string;
  name: string;
  type: CatType;
  behavior: Behavior;
  nature: Nature;
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
};
const BEHAVIOR_FROM_LIB: Record<CategoryBehavior, Behavior> = {
  [CategoryBehavior.Fixed]: 'fixed',
  [CategoryBehavior.Variable]: 'variable',
};

const NATURE_TO_LIB: Record<Nature, OperationalNature> = {
  operational: OperationalNature.Operational,
  'non-operational': OperationalNature.NonOperational,
};
const NATURE_FROM_LIB: Record<OperationalNature, Nature> = {
  [OperationalNature.Operational]: 'operational',
  [OperationalNature.NonOperational]: 'non-operational',
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
  return {
    id: (raw._id ?? raw.id) as string,
    name: raw.name,
    type: TYPE_FROM_LIB[raw.type],
    behavior: BEHAVIOR_FROM_LIB[raw.behavior],
    nature: NATURE_FROM_LIB[raw.operationalNature],
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
}

export interface UpdateCategoryInput {
  name?: string;
  type?: CatType;
  behavior?: Behavior;
  nature?: Nature;
}

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private categoryClient = inject(MintlyClientService).client.financialCategoryClient;

  readonly categories = signal<Category[]>([]);
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
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { response?: { status?: number } }).response?.status === 401
    );
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.call((headers) =>
        this.categoryClient.findAll({ page: 1, size: 500 }, headers),
      );
      this.categories.set((response.payload ?? []).map(toCategory));
    } finally {
      this.loading.set(false);
    }
  }

  /** audit/restaurantId/isSystem/usage/history ficam de fora: o servidor preenche (insert schema dedicado). */
  async create(input: CreateCategoryInput): Promise<void> {
    const body = {
      name: input.name,
      type: TYPE_TO_LIB[input.type],
      behavior: BEHAVIOR_TO_LIB[input.behavior],
      operationalNature: NATURE_TO_LIB[input.nature],
      status: RecordStatus.Active,
    } as unknown as FinancialCategory;
    await this.call((headers) => this.categoryClient.insert(body, headers));
    await this.refresh();
  }

  /** status não vai aqui de propósito: só muda via inactivate/reactivate (auditado). */
  async update(id: string, input: UpdateCategoryInput): Promise<void> {
    const patch: Partial<FinancialCategory> = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: TYPE_TO_LIB[input.type] } : {}),
      ...(input.behavior !== undefined ? { behavior: BEHAVIOR_TO_LIB[input.behavior] } : {}),
      ...(input.nature !== undefined ? { operationalNature: NATURE_TO_LIB[input.nature] } : {}),
    };
    await this.call((headers) => this.categoryClient.update(id, patch, headers));
    await this.refresh();
  }

  async inactivate(id: string): Promise<void> {
    await this.call((headers) => this.categoryClient.inactivateUpdate(id, headers));
    await this.refresh();
  }

  async reactivate(id: string): Promise<void> {
    await this.call((headers) => this.categoryClient.reactivateUpdate(id, headers));
    await this.refresh();
  }
}
