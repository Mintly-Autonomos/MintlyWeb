import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { SubscriptionService } from './subscription.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

const DAY = 24 * 60 * 60 * 1000;
const flags = environment as { useMocks: boolean };

describe('SubscriptionService (API)', () => {
  let svc: SubscriptionService;
  let auth: AuthService;
  let client: {
    overview: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
    mockDecide: ReturnType<typeof vi.fn>;
  };

  const overviewPayload = (endsAt: string | null, status = 'active') => ({
    payload: { status, endsAt, daysLeft: 20, expiresSoon: false, plans: [], provider: 'mock' },
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    svc = TestBed.inject(SubscriptionService);
    auth = TestBed.inject(AuthService);
    client = { overview: vi.fn(), checkout: vi.fn(), mockDecide: vi.fn() };
    (svc as unknown as { client: unknown }).client = client;
  });

  describe('refresh', () => {
    it('busca o estado, guarda a data limite no AuthService e publica o resumo', async () => {
      const end = new Date(Date.now() + 20 * DAY).toISOString();
      client.overview.mockResolvedValue(overviewPayload(end));

      const out = await svc.refresh();

      expect(out?.status).toBe('active');
      expect(svc.overview()?.endsAt).toBe(end);
      expect(auth.subscriptionState().endsAt).toBe(end);
      expect(auth.hasActiveSubscription()).toBe(true);
    });

    it('manda env e token nos cabeçalhos', async () => {
      client.overview.mockResolvedValue(overviewPayload(null, 'none'));
      await svc.refresh();
      expect(client.overview.mock.calls[0][0]).toHaveProperty('env');
      expect(client.overview.mock.calls[0][0].authorization).toMatch(/^Bearer /);
    });

    it('API que não conhece /subscription (404) devolve null: sem portão', async () => {
      client.overview.mockRejectedValue({ response: { status: 404 } });
      expect(await svc.refresh()).toBeNull();
    });

    it('404 no formato ApiError da lib (sem response) também significa "API sem assinatura"', async () => {
      client.overview.mockRejectedValue(
        Object.assign(new Error('não encontrado'), { code: 'APP-0001', status: 404 }),
      );
      expect(await svc.refresh()).toBeNull();
    });

    it('401 no formato ApiError da lib renova o token e tenta de novo', async () => {
      client.overview
        .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'AUTH-0001', status: 401 }))
        .mockResolvedValueOnce(overviewPayload(null, 'none'));
      vi.spyOn(auth, 'refresh').mockResolvedValue(true);
      expect((await svc.refresh())?.status).toBe('none');
      expect(client.overview).toHaveBeenCalledTimes(2);
    });

    it('outros erros sobem (a tela mostra "tentar de novo")', async () => {
      client.overview.mockRejectedValue({ response: { status: 500 } });
      await expect(svc.refresh()).rejects.toBeTruthy();
    });

    it('em 401 renova o token e tenta de novo', async () => {
      client.overview
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce(overviewPayload(null, 'none'));
      vi.spyOn(auth, 'refresh').mockResolvedValue(true);
      expect((await svc.refresh())?.status).toBe('none');
      expect(client.overview).toHaveBeenCalledTimes(2);
    });

    it('401 sem conseguir renovar leva à sessão expirada', async () => {
      client.overview.mockRejectedValue({ response: { status: 401 } });
      vi.spyOn(auth, 'refresh').mockResolvedValue(false);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await expect(svc.refresh()).rejects.toBeTruthy();
      expect(navigate).toHaveBeenCalledWith(['/auth/sessao-expirada']);
    });
  });

  describe('checkout', () => {
    it('manda só os meses (o valor nunca vai do cliente) e devolve o link de pagamento', async () => {
      client.checkout.mockResolvedValue({
        payload: {
          paymentId: 'p1',
          checkoutUrl: 'https://mp.test/pagar',
          provider: 'mercadopago',
          months: 6,
          totalCents: 81000,
        },
      });
      const out = await svc.checkout(6);
      expect(client.checkout.mock.calls[0][0]).toEqual({ months: 6 });
      expect(out.checkoutUrl).toBe('https://mp.test/pagar');
    });

    it('plano fora de 1, 3, 6 e 12 é recusado antes de chamar a API', async () => {
      await expect(svc.checkout(2 as never)).rejects.toThrow('Plano inválido');
      expect(client.checkout).not.toHaveBeenCalled();
    });

    it('resposta sem dados é erro', async () => {
      client.checkout.mockResolvedValue({});
      await expect(svc.checkout(1)).rejects.toThrow('sem dados');
    });

    it('guarda a data limite de antes do pagamento (base para saber se o pagamento foi confirmado)', async () => {
      const end = new Date(Date.now() + 10 * DAY).toISOString();
      auth.setSubscriptionEndsAt(end);
      client.checkout.mockResolvedValue({
        payload: {
          paymentId: 'p',
          checkoutUrl: 'x',
          provider: 'mock',
          months: 1,
          totalCents: 15000,
        },
      });
      await svc.checkout(1);
      expect(sessionStorage.getItem('mintly-checkout-baseline')).toBe(end);
    });
  });

  describe('isPaid (a volta do pagamento só vale quando a data mudou)', () => {
    const end = new Date(Date.now() + 10 * DAY).toISOString();
    const later = new Date(Date.now() + 40 * DAY).toISOString();

    it('não está ativa: não está pago', () => {
      expect(svc.isPaid({ status: 'expired', endsAt: end })).toBe(false);
      expect(svc.isPaid({ status: 'none', endsAt: null })).toBe(false);
    });

    it('sem registro de checkout (abriu a tela direto): ativa vale', () => {
      expect(svc.isPaid({ status: 'active', endsAt: end })).toBe(true);
    });

    it('renovação: ativa com a MESMA data de antes ainda não é pagamento confirmado', () => {
      sessionStorage.setItem('mintly-checkout-baseline', end);
      expect(svc.isPaid({ status: 'active', endsAt: end })).toBe(false);
      expect(svc.isPaid({ status: 'active', endsAt: later })).toBe(true);
    });

    it('primeira assinatura (antes: nenhuma): ativa já é pagamento confirmado', () => {
      sessionStorage.setItem('mintly-checkout-baseline', '');
      expect(svc.isPaid({ status: 'active', endsAt: end })).toBe(true);
    });

    it('clearBaseline apaga o registro', () => {
      sessionStorage.setItem('mintly-checkout-baseline', end);
      svc.clearBaseline();
      expect(sessionStorage.getItem('mintly-checkout-baseline')).toBeNull();
    });
  });

  describe('mockDecide (simulador)', () => {
    it('manda o pagamento e a decisão e atualiza o estado', async () => {
      client.mockDecide.mockResolvedValue({ payload: { status: 'approved' } });
      client.overview.mockResolvedValue(
        overviewPayload(new Date(Date.now() + 30 * DAY).toISOString()),
      );
      await svc.mockDecide('pay1', 'approved');
      expect(client.mockDecide.mock.calls[0][0]).toEqual({
        paymentId: 'pay1',
        decision: 'approved',
      });
      expect(client.overview).toHaveBeenCalled();
      expect(auth.hasActiveSubscription()).toBe(true);
    });
  });
});

describe('SubscriptionService (modo mock)', () => {
  let svc: SubscriptionService;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    flags.useMocks = true;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    svc = TestBed.inject(SubscriptionService);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    flags.useMocks = false;
  });

  it('o resumo traz os 4 planos e o provedor simulado', async () => {
    const o = await svc.refresh();
    expect(o?.provider).toBe('mock');
    expect(o?.plans.map((p) => p.months)).toEqual([1, 3, 6, 12]);
    expect(o?.status).toBe('none');
  });

  it('aprovar no simulador libera por 1 mês e dá para renovar somando ao que sobrou', async () => {
    const first = await svc.checkout(1);
    expect(first.checkoutUrl).toBe(`/assinatura/simulador?pagamento=${first.paymentId}`);
    await svc.mockDecide(first.paymentId, 'approved');

    expect(auth.hasActiveSubscription()).toBe(true);
    const end1 = new Date(auth.subscriptionState().endsAt as string);
    expect(end1.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);

    const second = await svc.checkout(3);
    await svc.mockDecide(second.paymentId, 'approved');
    const end2 = new Date(auth.subscriptionState().endsAt as string);
    expect(end2.getTime()).toBeGreaterThan(end1.getTime() + 88 * DAY);
  });

  it('recusar não libera nada', async () => {
    const c = await svc.checkout(12);
    await svc.mockDecide(c.paymentId, 'rejected');
    expect(auth.hasActiveSubscription()).toBe(false);
  });

  it('o total do plano no checkout vem da tabela da lib', async () => {
    expect((await svc.checkout(12)).totalCents).toBe(153000);
  });
});
