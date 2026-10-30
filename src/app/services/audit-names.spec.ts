import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoriasService } from './categorias.service';
import { ContasService } from './contas.service';
import { MovimentacoesService } from './movimentacoes.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

const ID = '6ae3d251869deda7ae146a3d';
const identity = <T>(fn: (h: unknown) => Promise<T>) => fn({});

describe('nome de quem criou/alterou (a API manda o nome junto do id)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('Movimentações: "Criado por" mostra o nome; sem nome, cai no id', async () => {
    const svc = TestBed.inject(MovimentacoesService);
    const base = {
      _id: 'm1',
      title: 'Venda',
      direction: 'in',
      status: 'settled',
      date: '2026-10-29T00:00:00.000Z',
      grossValue: 10,
      account: { _id: 'a1' },
      category: { _id: 'c1' },
      paymentMethod: 'cash',
    };
    (svc as unknown as { movementClient: unknown }).movementClient = {
      list: vi.fn().mockResolvedValue({
        payload: [
          {
            ...base,
            audit: {
              createdBy: ID,
              updatedBy: ID,
              createdByName: 'Davi Lee',
              updatedByName: 'Ana Costa',
            },
          },
          { ...base, _id: 'm2', audit: { createdBy: ID, updatedBy: ID } },
          { ...base, _id: 'm3' },
        ],
      }),
    };
    (svc as unknown as { call: unknown }).call = identity;

    await svc.refresh();

    const [a, b, c] = svc.movements();
    expect(a.createdBy).toBe('Davi Lee');
    expect(a.updatedBy).toBe('Ana Costa');
    expect(b.createdBy).toBe(ID);
    expect(c.createdBy).toBe('—');
  });

  it('Contas: nome em "criado por" e no histórico (em ordem: mais recente primeiro)', async () => {
    const svc = TestBed.inject(ContasService);
    (svc as unknown as { accountClient: unknown }).accountClient = {
      findAll: vi.fn().mockResolvedValue({
        payload: [
          {
            _id: 'a1',
            name: 'Caixa',
            type: 'cash',
            status: 'active',
            isDefault: true,
            audit: {
              createdBy: ID,
              updatedBy: ID,
              createdByName: 'Ana Costa',
              updatedByName: 'Ana Costa',
            },
            history: [
              { at: '2026-10-28T10:00:00.000Z', by: ID, byName: 'Ana Costa', action: 'create' },
              { at: '2026-10-29T10:00:00.000Z', by: 'system', action: 'inactivate' },
            ],
          },
        ],
      }),
    };
    (svc as unknown as { call: unknown }).call = identity;

    await svc.refresh();

    const [account] = svc.accounts();
    expect(account.createdBy).toBe('Ana Costa');
    expect(account.updatedBy).toBe('Ana Costa');
    expect(account.history.map((h) => h.by)).toEqual(['system', 'Ana Costa']);
  });

  it('Categorias: nome em "criado por" e no histórico', async () => {
    const svc = TestBed.inject(CategoriasService);
    (svc as unknown as { categoryClient: unknown }).categoryClient = {
      findAll: vi.fn().mockResolvedValue({
        payload: [
          {
            _id: 'c1',
            name: 'Venda Balcão',
            type: 'revenue',
            behavior: 'variable',
            operationalNature: 'operational',
            status: 'active',
            subcategories: [],
            audit: { createdBy: ID, updatedBy: ID, createdByName: 'Davi Lee' },
            history: [
              { at: '2026-10-28T10:00:00.000Z', by: ID, byName: 'Davi Lee', action: 'create' },
            ],
          },
        ],
      }),
    };
    (svc as unknown as { call: unknown }).call = identity;

    await svc.refresh();

    const [category] = svc.categories();
    expect(category.createdBy).toBe('Davi Lee');
    expect(category.updatedBy).toBe(ID);
    expect(category.history[0].by).toBe('Davi Lee');
  });
});
