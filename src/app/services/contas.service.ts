import { Injectable, signal, computed } from '@angular/core';

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
  id: number;
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

export const TYPE_META: Record<AccType, { icon: string; label: string; bg: string; color: string }> = {
  Bank:                { icon: 'account_balance',         label: 'Banco',                  bg: 'bg-ocean-soft',  color: 'text-ocean' },
  'Cash Register':     { icon: 'point_of_sale',           label: 'Caixa',                  bg: 'bg-mint-soft',   color: 'text-mint' },
  'Digital Wallet':    { icon: 'account_balance_wallet',  label: 'Carteira digital',        bg: 'bg-warning/10',  color: 'text-warning' },
  'Financial Platform':{ icon: 'storefront',              label: 'Plataforma financeira',   bg: 'bg-muted',       color: 'text-foreground/70' },
};

function mkAccount(
  id: number, name: string, type: AccType, active: boolean, isDefault: boolean,
  balance: number, predicted: number, extra: Partial<Account> = {}
): Account {
  const createdAt = '2025-01-12T09:24:00';
  const updatedAt = '2025-05-04T14:10:00';
  return {
    id, name, type, active, isDefault, balance, predictedBalance: predicted,
    createdBy: 'Marina Souza', createdAt, updatedBy: 'Marina Souza', updatedAt,
    history: [{ id: 1, at: createdAt, by: 'Marina Souza', action: 'Conta criada', detail: `Tipo: ${TYPE_META[type].label}`, icon: 'add_circle' }],
    ...extra,
  };
}

const INITIAL: Account[] = [
  mkAccount(1, 'Itaú PJ — Conta principal', 'Bank', true, true, 12480.55, 14210.0),
  mkAccount(2, 'Caixa Loja', 'Cash Register', true, false, 845.0, 845.0),
  mkAccount(3, 'Carteira PIX', 'Digital Wallet', true, false, 1620.4, 1720.4),
  mkAccount(4, 'iFood', 'Financial Platform', true, false, 3475.6, 5120.0, { taxPct: 12, settlementDays: 14 }),
  mkAccount(5, 'Rappi', 'Financial Platform', false, false, 0, 0, { taxPct: 18, settlementDays: 21 }),
  mkAccount(6, 'Cartão Stone', 'Financial Platform', false, false, 0, 0, { taxPct: 15, settlementDays: 30 }),
];

@Injectable({ providedIn: 'root' })
export class ContasService {
  // TODO: replace with HttpClient calls when backend is ready
  // GET /api/contas
  readonly accounts = signal<Account[]>(INITIAL);

  // TODO: POST /api/contas
  create(account: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'history'>): void {
    const now = new Date().toISOString();
    const id = Math.max(0, ...this.accounts().map(a => a.id)) + 1;
    this.accounts.update(all => [...all, {
      ...account, id,
      createdAt: now, updatedAt: now,
      history: [{ id: 1, at: now, by: account.createdBy, action: 'Conta criada', detail: `Tipo: ${TYPE_META[account.type].label}`, icon: 'add_circle' }],
    }]);
  }

  // TODO: PUT /api/contas/:id
  update(updated: Account): void {
    this.accounts.update(all => all.map(a => a.id === updated.id ? updated : a));
  }

  // TODO: DELETE /api/contas/:id
  remove(id: number): void {
    this.accounts.update(all => all.filter(a => a.id !== id));
  }
}
