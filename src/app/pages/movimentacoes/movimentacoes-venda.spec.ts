import { signal, WritableSignal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { Movement, MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

// S3.4: canal Encomendas, hora da venda e número de vendas no formulário.

interface Form {
  type: 'income' | 'expense';
  title: string;
  value: string;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: string;
  channel: string;
  saleTime: string;
  salesCount: string;
}

describe('Movimentações: canal, hora e número de vendas (relatório S3.4)', () => {
  function montar() {
    const vazio = { refresh: vi.fn().mockResolvedValue(undefined) };
    const register = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        // O componente consulta o perfil (problemas 23/11): sem o falso, o AuthService de verdade pede a URL da API.
        { provide: AuthService, useValue: { podeMudarCadastros: () => true, meuId: () => null } },
        provideRouter([]),
        {
          provide: MovimentacoesService,
          useValue: {
            ...vazio,
            register,
            update,
            movements: signal([]),
            loading: signal(false),
            loaded: signal(true),
          },
        },
        {
          provide: ContasService,
          useValue: {
            ...vazio,
            accounts: signal([{ id: 'nu', name: 'Nubank', type: 'Bank', active: true }]),
          },
        },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        {
          provide: CategoriasService,
          useValue: {
            ...vazio,
            categories: signal([
              { id: 'ven', name: 'Vendas', type: 'income', active: true, subcategories: [] },
              { id: 'emb', name: 'Embalagens', type: 'expense', active: true, subcategories: [] },
            ]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as {
      form: WritableSignal<Form>;
      openCreate(type?: 'income' | 'expense'): void;
      openEdit(m: Movement): void;
      setType(t: 'income' | 'expense'): void;
      save(): Promise<void>;
      formValid: boolean;
      saleTimeError: string;
      salesCountError: string;
    };
    const el = () => fixture.nativeElement as HTMLElement;
    return { c, fixture, el, register, update };
  }

  const preencher = (c: { form: WritableSignal<Form> }, extra: Partial<Form> = {}) =>
    c.form.update((f) => ({
      ...f,
      title: 'Fechamento do balcão',
      value: '1500',
      categoryId: f.type === 'income' ? 'ven' : 'emb',
      accountId: 'nu',
      paymentMethod: 'PIX',
      ...extra,
    }));

  it('entrada mostra canal, hora e quantas vendas; despesa não mostra', () => {
    const { c, fixture, el } = montar();
    c.openCreate('income');
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="campo-canal"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="campo-hora"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="campo-qtd-vendas"]')).not.toBeNull();
    const opcoes = [...el().querySelectorAll('[data-testid="campo-canal"] option')].map((o) =>
      o.textContent!.trim(),
    );
    expect(opcoes).toEqual(['Automático', 'Salão', 'Delivery', 'Encomendas']);

    c.setType('expense');
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="campo-canal"]')).toBeNull();
    expect(el().querySelector('[data-testid="campo-hora"]')).toBeNull();
  });

  it('registra a encomenda com hora e número de vendas', async () => {
    const { c, register } = montar();
    c.openCreate('income');
    preencher(c, { channel: 'orders', saleTime: '15:40', salesCount: '42' });
    expect(c.formValid).toBe(true);
    await c.save();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toMatchObject({
      type: 'income',
      channel: 'orders',
      saleTime: '15:40',
      salesCount: 42,
    });
  });

  it('em branco: canal automático, sem hora e sem número (vale 1)', async () => {
    const { c, register } = montar();
    c.openCreate('income');
    preencher(c);
    await c.save();
    expect(register.mock.calls[0][0]).toMatchObject({
      channel: null,
      saleTime: null,
      salesCount: null,
    });
  });

  it('número de vendas inválido bloqueia o registro', () => {
    const { c } = montar();
    c.openCreate('income');
    for (const v of ['0', '-3', '2,5', '10000']) {
      preencher(c, { salesCount: v });
      expect(c.salesCountError).not.toBe('');
      expect(c.formValid).toBe(false);
    }
    preencher(c, { salesCount: ' 12 ' });
    expect(c.salesCountError).toBe('');
    expect(c.formValid).toBe(true);
  });

  it('trocar para despesa limpa canal, hora e número de vendas', async () => {
    const { c, register } = montar();
    c.openCreate('income');
    preencher(c, { channel: 'orders', saleTime: '10:00', salesCount: '3' });
    c.setType('expense');
    preencher(c);
    await c.save();
    expect(register.mock.calls[0][0]).toMatchObject({
      type: 'expense',
      channel: null,
      saleTime: null,
      salesCount: null,
    });
  });

  it('editar abre com os valores guardados e manda as mudanças', async () => {
    const { c, update } = montar();
    c.openEdit({
      id: 'm1',
      title: 'Encomenda bolo',
      type: 'income',
      status: 'received',
      date: '2026-11-10',
      dueDate: null,
      settledAt: '2026-11-10',
      value: 180,
      categoryId: 'ven',
      subcategoryId: null,
      accountId: 'nu',
      paymentMethod: 'PIX',
      channel: 'orders',
      saleTime: '09:30',
      salesCount: 2,
      notes: null,
      createdBy: 'x',
      createdAt: '',
      updatedBy: 'x',
      updatedAt: '',
    });
    expect(c.form()).toMatchObject({ channel: 'orders', saleTime: '09:30', salesCount: '2' });
    c.form.update((f) => ({ ...f, saleTime: '', salesCount: '5' }));
    await c.save();
    expect(update).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ channel: 'orders', saleTime: null, salesCount: 5 }),
    );
  });
});
