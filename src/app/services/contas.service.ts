import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FinancialAccountType, RecordStatus } from 'mintly-lib';
import type { FinancialAccount, Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';

export type AccType = 'Bank' | 'Cash Register' | 'Digital Wallet' | 'Financial Platform';

export interface AuditEvent {
  id: number;
  at: string;
  by: string;
  action: string;
  detail?: string;
  icon: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccType;
  active: boolean;
  isDefault: boolean;
  balance: number;
  predictedBalance: number;
  taxPct?: number;
  settlementDays?: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  history: AuditEvent[];
}

export const TYPE_META: Record<
  AccType,
  { icon: string; label: string; bg: string; color: string }
> = {
  Bank: { icon: 'account_balance', label: 'Banco', bg: 'bg-ocean-soft', color: 'text-ocean' },
  'Cash Register': {
    icon: 'point_of_sale',
    label: 'Caixa',
    bg: 'bg-mint-soft',
    color: 'text-mint',
  },
  'Digital Wallet': {
    icon: 'account_balance_wallet',
    label: 'Carteira digital',
    bg: 'bg-warning/10',
    color: 'text-warning',
  },
  'Financial Platform': {
    icon: 'storefront',
    label: 'Plataforma financeira',
    bg: 'bg-muted',
    color: 'text-foreground/70',
  },
};

const TYPE_TO_LIB: Record<AccType, FinancialAccountType> = {
  Bank: FinancialAccountType.Bank,
  'Cash Register': FinancialAccountType.Cash,
  'Digital Wallet': FinancialAccountType.DigitalWallet,
  'Financial Platform': FinancialAccountType.Platform,
};

const TYPE_FROM_LIB: Record<FinancialAccountType, AccType> = {
  [FinancialAccountType.Bank]: 'Bank',
  [FinancialAccountType.Cash]: 'Cash Register',
  [FinancialAccountType.DigitalWallet]: 'Digital Wallet',
  [FinancialAccountType.Platform]: 'Financial Platform',
};

function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Converte a entity da lib (FinancialAccount) para o shape que a tela usa. */
function toAccount(raw: FinancialAccount): Account {
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
    active: raw.status === RecordStatus.Active,
    isDefault: raw.isDefault,
    balance: raw.availableBalance ?? 0,
    predictedBalance: raw.predictedBalance ?? 0,
    taxPct: 'feePercent' in raw ? (raw as { feePercent?: number }).feePercent : undefined,
    settlementDays:
      'settlementDays' in raw ? (raw as { settlementDays?: number }).settlementDays : undefined,
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
        icon: 'history',
      })),
  };
}

export interface CreateAccountInput {
  name: string;
  type: AccType;
  isDefault: boolean;
  taxPct?: number;
  settlementDays?: number;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccType;
  taxPct?: number;
  settlementDays?: number;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ContasService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private accountClient = inject(MintlyClientService).client.financialAccountClient;

  readonly accounts = signal<Account[]>([]);
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
        this.accountClient.findAll({ page: 1, size: 500 }, headers),
      );
      this.accounts.set((response.payload ?? []).map(toAccount));
    } finally {
      this.loading.set(false);
    }
  }

  async create(input: CreateAccountInput): Promise<void> {
    const now = new Date();
    const isPlatform = input.type === 'Financial Platform';
    const body = {
      // restaurantId é reforçado pelo servidor a partir do token; enviamos o valor
      // conhecido localmente só para satisfazer a validação do schema.
      restaurantId: this.auth.currentUser()?.restaurantId ?? '',
      name: input.name,
      type: TYPE_TO_LIB[input.type],
      status: RecordStatus.Active,
      isDefault: input.isDefault,
      availableBalance: 0,
      predictedBalance: 0,
      ...(isPlatform
        ? { feePercent: input.taxPct ?? 0, settlementDays: input.settlementDays ?? 0 }
        : {}),
      audit: { createdAt: now, updatedAt: now },
    } as unknown as FinancialAccount;
    await this.call((headers) => this.accountClient.insert(body, headers));
    await this.refresh();
  }

  async update(id: string, input: UpdateAccountInput): Promise<void> {
    const isPlatform = input.type === 'Financial Platform';
    const patch: Partial<FinancialAccount> = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: TYPE_TO_LIB[input.type] } : {}),
      ...(input.active !== undefined
        ? { status: input.active ? RecordStatus.Active : RecordStatus.Inactive }
        : {}),
      ...(isPlatform
        ? {
            feePercent: input.taxPct ?? 0,
            settlementDays: input.settlementDays ?? 0,
          }
        : {}),
    };
    await this.call((headers) => this.accountClient.update(id, patch, headers));
    await this.refresh();
  }

  /** Define a conta como padrão (guards e transação no servidor). */
  async setDefault(id: string): Promise<void> {
    await this.call((headers) => this.accountClient.defaultUpdate(id, headers));
    await this.refresh();
  }

  /** Inativa a conta (guards de saldo/única-ativa/padrão no servidor). */
  async inactivate(id: string, replacementDefaultId?: string): Promise<void> {
    await this.call((headers) =>
      this.accountClient.inactivateUpdate(id, { replacementDefaultId }, headers),
    );
    await this.refresh();
  }
}
