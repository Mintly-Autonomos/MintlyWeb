import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CategoriasComponent } from './categorias.component';
import { CategoriasService, Category } from '../../services/categorias.service';
import { ToastService } from '../../shared/toast.service';

const agora = new Date().toISOString();

const cat = (over: Partial<Category>): Category => ({
  id: 'c1',
  name: 'Aluguel',
  type: 'expense',
  behavior: 'fixed',
  nature: 'operational',
  dreGroup: 'opex',
  subcategories: [],
  active: true,
  protected: false,
  createdBy: 'x',
  createdAt: agora,
  updatedBy: 'x',
  updatedAt: agora,
  history: [],
  ...over,
});

/** O que o teste mexe direto, no padrão dos outros specs. */
interface Internals {
  tab: { set(v: 'income' | 'expense'): void };
  form(): { name: string; type: string; dreGroup: string };
  openCreate(): void;
  openEdit(c: Category): void;
  setField(k: string, v: unknown): void;
  setDreGroup(g: string): void;
  save(): Promise<void>;
  dreFilter: { set(v: string): void };
}

describe('CategoriasComponent — onde a despesa entra no resultado', () => {
  function render(categories: Category[]) {
    const svc = {
      categories: signal(categories),
      loading: signal(false),
      refresh: vi.fn(() => Promise.resolve()),
      create: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      inactivate: vi.fn(() => Promise.resolve()),
      reactivate: vi.fn(() => Promise.resolve()),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: CategoriasService, useValue: svc },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), show: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(CategoriasComponent);
    const c = fixture.componentInstance as unknown as Internals;
    c.tab.set('expense');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    const selector = () => root.querySelector('[data-testid=dre-group]');
    const marcado = () =>
      root.querySelector('[data-testid=dre-group] [aria-checked=true]')?.getAttribute('data-group');
    return { fixture, root, text, svc, c, selector, marcado };
  }

  const digitar = (fixture: { detectChanges(): void }, c: Internals, nome: string) => {
    c.setField('name', nome);
    fixture.detectChanges();
  };

  it('nova despesa mostra o seletor, começando em despesa operacional', () => {
    const { fixture, c, selector, marcado } = render([]);
    c.openCreate();
    fixture.detectChanges();
    expect(selector()).not.toBeNull();
    expect(marcado()).toBe('opex');
  });

  it('nova receita não mostra o seletor (só despesa tem grupo)', () => {
    const { fixture, c, selector } = render([]);
    c.tab.set('income');
    c.openCreate();
    fixture.detectChanges();
    expect(c.form().type).toBe('income');
    expect(selector()).toBeNull();
  });

  it('o nome de ingrediente já marca CMV e avisa que foi sugestão', () => {
    const { fixture, c, marcado, root } = render([]);
    c.openCreate();
    digitar(fixture, c, 'Fornecedor');
    expect(marcado()).toBe('cmv');
    expect(root.querySelector('[data-testid=dre-hint-auto]')).not.toBeNull();
  });

  it('apagar o nome ou trocar para algo que não é insumo volta para despesa operacional', () => {
    const { fixture, c, marcado } = render([]);
    c.openCreate();
    digitar(fixture, c, 'Fornecedor');
    digitar(fixture, c, 'Aluguel');
    expect(marcado()).toBe('opex');
  });

  it('depois que a pessoa escolhe o grupo, o nome não mexe mais nele', () => {
    const { fixture, c, marcado } = render([]);
    c.openCreate();
    c.setDreGroup('labor');
    digitar(fixture, c, 'Fornecedor');
    expect(marcado()).toBe('labor');
  });

  it('cria a despesa com o grupo escolhido', async () => {
    const { fixture, c, svc } = render([]);
    c.openCreate();
    digitar(fixture, c, 'Fornecedor');
    await c.save();
    expect(svc.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fornecedor', type: 'expense', dreGroup: 'cmv' }),
    );
  });

  it('receita é criada sem grupo', async () => {
    const { fixture, c, svc } = render([]);
    c.tab.set('income');
    c.openCreate();
    digitar(fixture, c, 'Venda Balcão');
    await c.save();
    const body = (svc.create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(body['dreGroup']).toBeUndefined();
  });

  it('editar o "Fornecedor" que já existe: não muda sozinho, avisa, e salva CMV quando a pessoa escolhe', async () => {
    const fornecedor = cat({
      id: 'f1',
      name: 'Fornecedor',
      behavior: 'variable',
      dreGroup: 'opex',
    });
    const { fixture, c, marcado, root, svc } = render([fornecedor]);
    c.openEdit(fornecedor);
    fixture.detectChanges();
    expect(marcado()).toBe('opex');
    expect(root.querySelector('[data-testid=dre-hint-parece]')).not.toBeNull();
    expect(root.querySelector('[data-testid=dre-hint-auto]')).toBeNull();

    c.setDreGroup('cmv');
    fixture.detectChanges();
    expect(marcado()).toBe('cmv');
    expect(root.querySelector('[data-testid=dre-hint-parece]')).toBeNull();

    await c.save();
    expect(svc.update).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ name: 'Fornecedor', dreGroup: 'cmv' }),
    );
  });

  it('lista despesas com onde cada uma entra, e filtra por isso', () => {
    const { fixture, text, c, root } = render([
      cat({ id: 'a', name: 'Aluguel', dreGroup: 'opex' }),
      cat({ id: 'b', name: 'Fornecedor', dreGroup: 'cmv' }),
      cat({ id: 'c', name: 'Salários', dreGroup: 'labor', protected: true }),
    ]);
    expect(text()).toContain('Onde entra');
    expect(text()).toContain('CMV');
    expect(text()).toContain('Mão de obra');
    expect(text()).toContain('Despesa operacional');

    c.dreFilter.set('cmv');
    fixture.detectChanges();
    const nomes = Array.from(root.querySelectorAll('tbody tr')).map((r) => r.textContent ?? '');
    expect(nomes).toHaveLength(1);
    expect(nomes[0]).toContain('Fornecedor');
  });

  it('na aba de receitas não há coluna nem filtro "Onde entra"', () => {
    const { fixture, c, text } = render([cat({ id: 'r', name: 'Venda Balcão', type: 'income' })]);
    c.tab.set('income');
    fixture.detectChanges();
    expect(text()).not.toContain('Onde entra');
  });
});
