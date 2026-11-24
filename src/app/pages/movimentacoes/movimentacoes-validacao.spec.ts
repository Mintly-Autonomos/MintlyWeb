import { signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

interface Interno {
  form: {
    (): Record<string, unknown>;
    update(fn: (f: Record<string, unknown>) => Record<string, unknown>): void;
  };
  openCreate(t?: 'income' | 'expense'): void;
  amountError: string;
  dateError: string;
  missingFields: string[];
  formValid: boolean;
  formDirty: boolean;
}

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('Movimentações: validação do formulário (relatório, seção 8.3)', () => {
  function montar() {
    const vazio = { refresh: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        // O componente consulta o perfil (problemas 23/11): sem o falso, o AuthService de verdade pede a URL da API.
        { provide: AuthService, useValue: { podeMudarCadastros: () => true, meuId: () => null } },
        provideRouter([]),
        {
          provide: MovimentacoesService,
          useValue: {
            ...vazio,
            movements: signal([]),
            loading: signal(false),
            loaded: signal(true),
          },
        },
        {
          provide: ContasService,
          useValue: {
            ...vazio,
            accounts: signal([{ id: 'a1', name: 'Caixa', active: true, isDefault: true }]),
          },
        },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        {
          provide: CategoriasService,
          useValue: {
            ...vazio,
            categories: signal([{ id: 'c1', name: 'Aluguel', type: 'expense', active: true }]),
          },
        },
      ],
    });
    TestBed.overrideComponent(MovimentacoesComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as Interno;
    c.openCreate('expense');
    const set = (over: Record<string, unknown>) => c.form.update((f) => ({ ...f, ...over }));
    return { c, set };
  }

  it('diz o que falta preencher, em vez de só desabilitar o botão', () => {
    const { c, set } = montar();
    expect(c.missingFields).toEqual(['título', 'valor', 'categoria', 'forma de pagamento']);
    set({ title: 'Aluguel', value: '4.200,00', categoryId: 'c1', paymentMethod: 'Boleto' });
    expect(c.missingFields).toEqual([]);
    expect(c.formValid).toBe(true);
  });

  it('valor acima de R$ 10 milhões é recusado (quase sempre é zero a mais)', () => {
    const { c, set } = montar();
    set({ value: '9.999.999.999,99' });
    expect(c.amountError).toContain('confira se não sobrou um zero');
    set({ value: '4.200,00' });
    expect(c.amountError).toBe('');
  });

  it('pago com data no futuro, ou data absurda, não passa', () => {
    const { c, set } = montar();
    set({ date: '2099-12-31', status: 'paid' });
    expect(c.dateError).toContain('Pago com data no futuro');
    set({ status: 'pending' });
    expect(c.dateError).toBe('');
    set({ date: '1900-01-01', status: 'paid' });
    expect(c.dateError).toContain('Data muito antiga');
    set({ date: hoje(), status: 'paid' });
    expect(c.dateError).toBe('');
  });

  it('sabe quando algo foi preenchido (para o Esc perguntar antes de descartar)', () => {
    const { c, set } = montar();
    expect(c.formDirty).toBe(false);
    set({ title: 'Conta de luz' });
    expect(c.formDirty).toBe(true);
  });
});
