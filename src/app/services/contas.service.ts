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

/**
 * Ícone por ação de histórico. As ações reais gravadas pelo servidor (use cases
 * de setDefault/inactivate) são tokens em kebab-case ('set-default',
 * 'unset-default', 'inactivate') — não os rótulos em PT do mock antigo. Mapeia
 * por palavra-chave pra também cobrir eventuais ações futuras/rótulos em PT.
 */
function actionIcon(action: string): string {
  const a = action.toLowerCase();
  if (a === 'set-default' || a.includes('padrão') || (a.includes('default') && !a.includes('unset')))
    return 'star';
  if (a === 'unset-default' || a.includes('removida como padrão')) return 'star_border';
  if (a.includes('inactivate') || a.includes('inativa')) return 'pause_circle';
  if (a.includes('reactivate') || a.includes('reativa') || a.includes('activate')) return 'play_circle';
  if (a.includes('fee') || a.includes('taxa') || a.includes('percent')) return 'percent';
  if (a.includes('settlement') || a.includes('prazo')) return 'schedule';
  if (a.includes('name') || a.includes('nome')) return 'edit';
  if (a.includes('create') || a.includes('criada')) return 'add_circle';
  return 'history';
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
        icon: actionIcon(h.action),
      })),
  };
}

export interface CreateAccountInput {
  name: string;
  type: AccType;
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

  /**
   * Cria a conta sempre como não-padrão: isDefault só pode mudar via setDefault
   * (rota transacional, índice único parcial {restaurantId} where isDefault:true).
   * Quem chama decide se promove a conta recém-criada a padrão (via setDefault),
   * usando o id retornado aqui.
   */
  async create(input: CreateAccountInput): Promise<string> {
    const now = new Date();
    const isPlatform = input.type === 'Financial Platform';
    const body = {
      // restaurantId é reforçado pelo servidor a partir do token; enviamos o valor
      // conhecido localmente só para satisfazer a validação do schema.
      restaurantId: this.auth.currentUser()?.restaurantId ?? '',
      name: input.name,
      type: TYPE_TO_LIB[input.type],
      status: RecordStatus.Active,
      isDefault: false,
      // availableBalance/predictedBalance ficam de fora: o repositório já default
      // pra 0 no insert quando ausentes.
      ...(isPlatform
        ? { feePercent: input.taxPct ?? 0, settlementDays: input.settlementDays ?? 0 }
        : {}),
      // audit ainda é obrigatório na validação atual do insert (financialAccountSchema
      // completo, sem schema dedicado de criação) — testado ao vivo: sem isso dá
      // VALIDATION_ERROR. PENDÊNCIA: mover esse fill pro servidor quando a API
      // ganhar um schema de insert que não exija audit do client.
      audit: { createdAt: now, updatedAt: now },
    } as unknown as FinancialAccount;
    const response = await this.call((headers) => this.accountClient.insert(body, headers));
    const id = (response.payload?._id ?? response.payload?.id) as string;
    await this.refresh();
    return id;
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
