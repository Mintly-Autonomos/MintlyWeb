import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

describe('Movimentações: transferência entre contas na lista (relatório S3.2)', () => {
  function montar() {
    const vazio = { refresh: vi.fn().mockResolvedValue(undefined) };
    const categorias = signal([
      { id: 'c-venda', name: 'Venda Balcão', type: 'income', active: true },
      {
        id: 'c-tin',
        name: 'Transferência entre contas (entrada)',
        type: 'income',
        active: true,
        system: true,
      },
    ]);
    const movs = [
      {
        id: 't1',
        title: 'Transferência de iFood',
        type: 'income',
        status: 'received',
        value: 500,
        date: '2025-10-10',
        categoryId: 'c-tin',
        accountId: 'a-nu',
        transfer: { id: 'tx', counterpartName: 'iFood' },
      },
      {
        id: 'v1',
        title: 'Venda',
        type: 'income',
        status: 'received',
        value: 50,
        date: '2025-10-09',
        categoryId: 'c-venda',
        accountId: 'a-nu',
      },
    ];
    TestBed.configureTestingModule({
      providers: [
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
          useValue: { ...vazio, accounts: signal([{ id: 'a-nu', name: 'Nubank', active: true }]) },
        },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        {
          provide: CategoriasService,
          useValue: {
            ...vazio,
            categories: categorias,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    return {
      root: fixture.nativeElement as HTMLElement,
      c: fixture.componentInstance as unknown as {
        allActiveCategories(): { id: string }[];
        categoryName(id: string): string;
      },
    };
  }

  it('a linha da transferência tem o selo e não tem o botão de editar; a venda tem', () => {
    const { root } = montar();
    const linhas = [...root.querySelectorAll('tbody tr')];
    const transf = linhas.find((tr) => tr.textContent!.includes('Transferência de iFood'))!;
    const venda = linhas.find((tr) => tr.textContent!.includes('Venda'))!;
    expect(transf.querySelector('[data-testid="chip-transferencia"]')).not.toBeNull();
    expect(transf.querySelector('button[title="Editar"]')).toBeNull();
    expect(venda.querySelector('button[title="Editar"]')).not.toBeNull();
  });

  it('a categoria do sistema não aparece para escolha, mas o nome continua na lista', () => {
    const { c } = montar();
    expect(c.allActiveCategories().map((x) => x.id)).toEqual(['c-venda']);
    expect(c.categoryName('c-tin')).toBe('Transferência entre contas (entrada)');
  });
});
