import { Injectable, signal } from '@angular/core';

export type CatType = 'income' | 'expense';
export type Behavior = 'fixed' | 'variable';
export type Nature = 'operational' | 'non-operational';

export interface AuditEvent {
  id: number; at: string; by: string; action: string; detail?: string; icon: string;
}

export interface Category {
  id: number;
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

function mk(id: number, name: string, type: CatType, behavior: Behavior, nature: Nature, active: boolean, extra: Partial<Category> = {}): Category {
  const createdAt = '2025-01-12T09:24:00';
  const updatedAt = '2025-05-04T14:10:00';
  return {
    id, name, type, behavior, nature, active,
    createdBy: 'Marina Souza', createdAt, updatedBy: 'Marina Souza', updatedAt,
    history: [{ id: 1, at: createdAt, by: 'Marina Souza', action: 'Categoria criada', icon: 'add_circle' }],
    ...extra,
  };
}

const INITIAL: Category[] = [
  mk(1,  'Venda Balcão',      'income',  'variable', 'operational',     true),
  mk(2,  'Venda Delivery',    'income',  'variable', 'operational',     true,  { protected: true }),
  mk(3,  'Receita Financeira','income',  'variable', 'non-operational', true),
  mk(10, 'CMV / Insumos',     'expense', 'variable', 'operational',     true,  { protected: true }),
  mk(20, 'Salários',          'expense', 'fixed',    'operational',     true),
  mk(21, 'Aluguel',           'expense', 'fixed',    'operational',     true),
  mk(22, 'Impostos',          'expense', 'variable', 'non-operational', true),
  mk(30, 'Marketing antigo',  'expense', 'variable', 'non-operational', false),
];

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  // TODO: replace with HttpClient calls
  // GET /api/categorias
  readonly categories = signal<Category[]>(INITIAL);

  // TODO: POST /api/categorias
  create(c: Omit<Category, 'id'>): void {
    this.categories.update(all => [...all, { ...c, id: Math.max(0, ...all.map(x => x.id)) + 1 }]);
  }

  // TODO: PUT /api/categorias/:id
  update(c: Category): void {
    this.categories.update(all => all.map(x => x.id === c.id ? c : x));
  }
}
