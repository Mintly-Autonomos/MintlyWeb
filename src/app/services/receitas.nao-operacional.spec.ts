import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { CategoriasService } from './categorias.service';
import { MintlyClientService } from './mintly-client.service';
import { MovimentacoesService } from './movimentacoes.service';
import { ReceitasService } from './receitas.service';

const flags = environment as { useMocks: boolean };
const hojeIso = () => new Date().toISOString().slice(0, 10);

describe('ReceitasService: empréstimo e aporte (Não operacional) não são venda', () => {
  it('fica de fora da tendência e do total da Receitas', async () => {
    flags.useMocks = false;
    const dia = hojeIso();
    const mov = (id: string, categoryId: string, value: number) => ({
      id,
      title: id,
      type: 'income',
      status: 'received',
      value,
      net: value,
      date: dia,
      settledAt: dia,
      dueDate: null,
      categoryId,
      subcategoryId: null,
      accountId: 'a1',
      paymentMethod: 'pix',
      channel: null,
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { getAccessToken: () => 't', refresh: vi.fn(), onApiError: vi.fn() },
        },
        {
          provide: MovimentacoesService,
          useValue: {
            refresh: vi.fn().mockResolvedValue(undefined),
            movements: signal([mov('venda', 'c-venda', 1000), mov('emprestimo', 'c-emp', 15000)]),
          },
        },
        {
          provide: CategoriasService,
          useValue: {
            refresh: vi.fn().mockResolvedValue(undefined),
            categories: signal([
              {
                id: 'c-venda',
                name: 'Venda Balcão',
                type: 'income',
                nature: 'operational',
                subcategories: [],
              },
              {
                id: 'c-emp',
                name: 'Empréstimos recebidos',
                type: 'income',
                nature: 'non-operational',
                subcategories: [],
              },
            ]),
          },
        },
        {
          provide: MintlyClientService,
          useValue: {
            client: { reportClient: { result: vi.fn().mockResolvedValue({ payload: null }) } },
          },
        },
      ],
    });
    const svc = TestBed.inject(ReceitasService);
    await svc.refresh('Este mês');
    const ultimo = svc.data()!.tendencia.at(-1)!;
    expect(ultimo.total).toBe(1000);
  });
});
