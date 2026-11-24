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
  visiveis(): { id: string }[];
  filtered(): { id: string }[];
  mostrarMais(): void;
  query: { set(v: string): void };
  typeFilter: { set(v: string): void };
}

const mov = (i: number, over: Record<string, unknown> = {}) => ({
  id: `m${i}`,
  title: `Fechamento ${i}`,
  type: 'income',
  status: 'received',
  value: 10,
  // Ano passado: tudo até hoje (lançamento futuro fica escondido na lista, ver movimentacoes-futuros.spec).
  date: `2025-${String(1 + (i % 12)).padStart(2, '0')}-10`,
  categoryId: 'c-venda',
  accountId: 'a-caixa',
  ...over,
});

describe('Movimentações: lista longa e busca', () => {
  function montar(movs: ReturnType<typeof mov>[]) {
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
            movements: signal(movs),
            loading: signal(false),
            loaded: signal(true),
          },
        },
        {
          provide: ContasService,
          useValue: {
            ...vazio,
            accounts: signal([{ id: 'a-caixa', name: 'Caixa', active: true }]),
          },
        },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        {
          provide: CategoriasService,
          useValue: {
            ...vazio,
            categories: signal([
              { id: 'c-venda', name: 'Venda Balcão', type: 'income' },
              { id: 'c-vt', name: 'Vale-transporte', type: 'expense' },
            ]),
          },
        },
      ],
    });
    TestBed.overrideComponent(MovimentacoesComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    return { c: fixture.componentInstance as unknown as Interno, fixture };
  }

  it('com 250 lançamentos mostra 100 por vez e "Mostrar mais" traz os próximos', () => {
    const { c } = montar(Array.from({ length: 250 }, (_, i) => mov(i)));
    expect(c.filtered()).toHaveLength(250);
    expect(c.visiveis()).toHaveLength(100);
    c.mostrarMais();
    expect(c.visiveis()).toHaveLength(200);
    c.mostrarMais();
    expect(c.visiveis()).toHaveLength(250);
  });

  it('mudar a busca ou o filtro volta para as primeiras 100', () => {
    const { c, fixture } = montar(Array.from({ length: 250 }, (_, i) => mov(i)));
    c.mostrarMais();
    expect(c.visiveis()).toHaveLength(200);
    c.typeFilter.set('income');
    fixture.detectChanges();
    expect(c.visiveis()).toHaveLength(100);
  });

  it('a busca acha pelo nome da categoria e da conta, não só pelo título', () => {
    const { c } = montar([
      mov(1, { title: 'VT da Joana', type: 'expense', status: 'paid', categoryId: 'c-vt' }),
      mov(2, { title: 'Ônibus', type: 'expense', status: 'paid', categoryId: 'c-vt' }),
      mov(3, { title: 'Fechamento do dia' }),
    ]);
    c.query.set('vale-transporte');
    expect(
      c
        .filtered()
        .map((m) => m.id)
        .sort(),
    ).toEqual(['m1', 'm2']);
    c.query.set('caixa');
    expect(c.filtered()).toHaveLength(3);
  });
});
