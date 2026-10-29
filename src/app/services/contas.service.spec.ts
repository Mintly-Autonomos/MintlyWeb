import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContasService } from './contas.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

describe('ContasService.update (modo real)', () => {
  let svc: ContasService;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    svc = TestBed.inject(ContasService);
    update = vi.fn().mockResolvedValue({ payload: {} });
    (svc as unknown as { accountClient: unknown }).accountClient = {
      update,
      findAll: vi.fn().mockResolvedValue({ payload: [] }),
    };
    (svc as unknown as { call: unknown }).call = (fn: (h: unknown) => Promise<unknown>) => fn({});
  });

  const corpo = () => update.mock.calls[0][1] as Record<string, unknown>;

  it('nunca manda o tipo no PATCH: o tipo da conta é imutável e a API recusa qualquer type (409)', async () => {
    await svc.update('acc1', { name: 'iFood', type: 'Financial Platform', taxPct: 14 });
    expect(corpo()).not.toHaveProperty('type');
  });

  it('conta de plataforma continua mandando taxa e prazo', async () => {
    await svc.update('acc1', {
      name: 'iFood',
      type: 'Financial Platform',
      taxPct: 14,
      settlementDays: 7,
    });
    expect(corpo()).toMatchObject({ name: 'iFood', feePercent: 14, settlementDays: 7 });
  });

  it('conta que não é de plataforma não manda taxa nem prazo', async () => {
    await svc.update('acc1', { name: 'Caixa', type: 'Cash Register' });
    expect(corpo()).toEqual({ name: 'Caixa' });
  });

  it('reativar viaja como status no mesmo PATCH', async () => {
    await svc.update('acc1', { active: true });
    expect(corpo()).toEqual({ status: expect.anything() });
  });
});
