import { Injectable, signal } from '@angular/core';

export type MovType = 'income' | 'expense';
export type MovStatus = 'received' | 'paid' | 'pending' | 'cancelled';
export type PaymentMethod =
  | 'Dinheiro'
  | 'PIX'
  | 'Débito'
  | 'Crédito'
  | 'Transferência'
  | 'Boleto'
  | 'Carteira Digital';

export interface Movement {
  id: number;
  title: string;
  type: MovType;
  status: MovStatus;
  date: string; // YYYY-MM-DD
  value: number;
  categoryId: number | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AccountLite {
  id: number;
  name: string;
  type: string;
  taxPct?: number;
  settlementDays?: number;
}
export interface CategoryLite {
  id: number;
  name: string;
  type: MovType;
}

export const MOV_ACCOUNTS: AccountLite[] = [
  { id: 1, name: 'Itaú PJ — Conta principal', type: 'Bank' },
  { id: 2, name: 'Caixa Loja', type: 'Cash Register' },
  { id: 3, name: 'Carteira PIX', type: 'Digital Wallet' },
  { id: 4, name: 'iFood', type: 'Financial Platform', taxPct: 12, settlementDays: 14 },
];

export const MOV_CATEGORIES: CategoryLite[] = [
  { id: 1, name: 'Venda Balcão', type: 'income' },
  { id: 2, name: 'Venda Delivery', type: 'income' },
  { id: 3, name: 'Receita Financeira', type: 'income' },
  { id: 10, name: 'CMV / Insumos', type: 'expense' },
  { id: 20, name: 'Salários', type: 'expense' },
  { id: 21, name: 'Aluguel', type: 'expense' },
  { id: 22, name: 'Impostos', type: 'expense' },
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  'Dinheiro',
  'PIX',
  'Débito',
  'Crédito',
  'Transferência',
  'Boleto',
  'Carteira Digital',
];

export const STATUS_META: Record<
  MovStatus,
  {
    label: string;
    tone: 'neutral' | 'mint' | 'ocean' | 'success' | 'warning' | 'error';
    icon: string;
  }
> = {
  received: { label: 'Recebido', tone: 'success', icon: 'check_circle' },
  paid: { label: 'Pago', tone: 'success', icon: 'check_circle' },
  pending: { label: 'Pendente', tone: 'warning', icon: 'schedule' },
  cancelled: { label: 'Cancelado', tone: 'neutral', icon: 'cancel' },
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function now(): string {
  return new Date().toISOString();
}

const t = now();
const INITIAL: Movement[] = [
  {
    id: 1,
    title: 'Venda almoço',
    type: 'income',
    status: 'received',
    date: todayISO(),
    value: 1240.5,
    categoryId: 1,
    accountId: null,
    paymentMethod: 'Dinheiro',
    notes: null,
    createdBy: 'Você',
    createdAt: t,
    updatedBy: 'Você',
    updatedAt: t,
  },
  {
    id: 2,
    title: 'Pedidos iFood — sábado',
    type: 'income',
    status: 'pending',
    date: todayISO(),
    value: 870.0,
    categoryId: 2,
    accountId: null,
    paymentMethod: 'Crédito',
    notes: null,
    createdBy: 'Você',
    createdAt: t,
    updatedBy: 'Você',
    updatedAt: t,
  },
  {
    id: 3,
    title: 'Compra de hortifruti',
    type: 'expense',
    status: 'paid',
    date: addDays(todayISO(), -1),
    value: 320.9,
    categoryId: 10,
    accountId: null,
    paymentMethod: 'PIX',
    notes: null,
    createdBy: 'Você',
    createdAt: t,
    updatedBy: 'Você',
    updatedAt: t,
  },
  {
    id: 4,
    title: 'Aluguel — junho',
    type: 'expense',
    status: 'pending',
    date: addDays(todayISO(), -2),
    value: 2200.0,
    categoryId: 21,
    accountId: null,
    paymentMethod: 'Boleto',
    notes: null,
    createdBy: 'Você',
    createdAt: t,
    updatedBy: 'Você',
    updatedAt: t,
  },
];

@Injectable({ providedIn: 'root' })
export class MovimentacoesService {
  // TODO: replace with HttpClient calls
  // GET /api/movimentacoes
  readonly movements = signal<Movement[]>(INITIAL);

  // TODO: POST /api/movimentacoes
  create(m: Omit<Movement, 'id'>): void {
    this.movements.update((all) => [
      { ...m, id: Math.max(0, ...all.map((x) => x.id)) + 1 },
      ...all,
    ]);
  }

  // TODO: PUT /api/movimentacoes/:id
  update(m: Movement): void {
    this.movements.update((all) => all.map((x) => (x.id === m.id ? m : x)));
  }
}
