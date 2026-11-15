import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MovementDirection, MovementStatus, PaymentMethod } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';
import { MOVEMENTS_PAGE_SIZE, MovimentacoesService } from './movimentacoes.service';

const flags = environment as { useMocks: boolean };

const raw = (id: string, date: string) => ({
  _id: id,
  direction: MovementDirection.In,
  title: `Venda ${id}`,
  status: MovementStatus.Settled,
  date,
  grossValue: 10,
  feeValue: 0,
  netValue: 10,
  paymentMethod: PaymentMethod.Pix,
  account: { _id: 'a1', name: 'Caixa', type: 'cash' },
  category: { _id: 'c1', name: 'Vendas', type: 'revenue' },
});

describe('MovimentacoesService: carrega TODAS as páginas (antes parava em 500)', () => {
  function montar(paginas: ReturnType<typeof raw>[][]) {
    flags.useMocks = false;
    const list = vi.fn((q: { page: number; size: number }) =>
      Promise.resolve({
        payload: paginas[q.page - 1] ?? [],
        pagination: {
          page: q.page,
          size: q.size,
          totalItems: paginas.flat().length,
          totalPages: paginas.length,
        },
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { getAccessToken: () => 't', refresh: vi.fn() } },
        {
          provide: MintlyClientService,
          useValue: { client: { financialMovementClient: { list } } },
        },
      ],
    });
    return { svc: TestBed.inject(MovimentacoesService), list };
  }
  afterEach(() => {
    flags.useMocks = false;
  });

  it('pede a 1ª página, vê quantas existem e busca as outras', async () => {
    const p1 = [raw('1', '2026-11-01'), raw('2', '2026-10-01')];
    const p2 = [raw('3', '2026-09-01')];
    const p3 = [raw('4', '2026-05-01')];
    const { svc, list } = montar([p1, p2, p3]);

    await svc.refresh();

    expect(list).toHaveBeenCalledTimes(3);
    expect(list.mock.calls.map((c) => c[0])).toEqual([
      { page: 1, size: MOVEMENTS_PAGE_SIZE },
      { page: 2, size: MOVEMENTS_PAGE_SIZE },
      { page: 3, size: MOVEMENTS_PAGE_SIZE },
    ]);
    // maio também aparece (antes, tudo depois da 1ª página sumia)
    expect(svc.movements().map((m) => m.id)).toEqual(['1', '2', '3', '4']);
  });

  it('uma página só: uma chamada', async () => {
    const { svc, list } = montar([[raw('1', '2026-11-01')]]);
    await svc.refresh();
    expect(list).toHaveBeenCalledTimes(1);
    expect(svc.movements()).toHaveLength(1);
  });

  it('se um lançamento aparecer em duas páginas (inserção no meio da carga), entra uma vez só', async () => {
    const { svc } = montar([
      [raw('1', '2026-11-01'), raw('2', '2026-10-01')],
      [raw('2', '2026-10-01'), raw('3', '2026-09-01')],
    ]);
    await svc.refresh();
    expect(svc.movements().map((m) => m.id)).toEqual(['1', '2', '3']);
  });
});
