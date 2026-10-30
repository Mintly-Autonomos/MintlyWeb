import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

const DAY = 24 * 60 * 60 * 1000;
const flags = environment as { useMocks: boolean };

const response = (status: number, code?: string) => ({
  response: { status, data: code ? { code } : {} },
});

describe('AuthService — assinatura', () => {
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  describe('estado', () => {
    it('sem data guardada: nunca assinou', () => {
      expect(auth.subscriptionState().status).toBe('none');
      expect(auth.hasActiveSubscription()).toBe(false);
    });

    it('data no futuro: ativa; data no passado: vencida', () => {
      auth.setSubscriptionEndsAt(new Date(Date.now() + 5 * DAY).toISOString());
      expect(auth.hasActiveSubscription()).toBe(true);
      auth.setSubscriptionEndsAt(new Date(Date.now() - 1000).toISOString());
      expect(auth.subscriptionState().status).toBe('expired');
      expect(auth.hasActiveSubscription()).toBe(false);
    });

    it('a 3 dias do fim avisa; a 4 dias não', () => {
      auth.setSubscriptionEndsAt(new Date(Date.now() + 3 * DAY - 1000).toISOString());
      expect(auth.subscriptionState().expiresSoon).toBe(true);
      auth.setSubscriptionEndsAt(new Date(Date.now() + 4 * DAY).toISOString());
      expect(auth.subscriptionState().expiresSoon).toBe(false);
    });

    it('a data fica guardada entre recarregamentos e some ao limpar com null', () => {
      const end = new Date(Date.now() + 5 * DAY).toISOString();
      auth.setSubscriptionEndsAt(end);
      expect(
        localStorage.getItem('mintly-subscription-ends') ??
          sessionStorage.getItem('mintly-subscription-ends'),
      ).toBe(end);
      auth.setSubscriptionEndsAt(null);
      expect(localStorage.getItem('mintly-subscription-ends')).toBeNull();
      expect(sessionStorage.getItem('mintly-subscription-ends')).toBeNull();
    });

    it('sair da conta apaga a assinatura guardada e a marca de onboarding', () => {
      auth.setSubscriptionEndsAt(new Date(Date.now() + 5 * DAY).toISOString());
      sessionStorage.setItem('mintly-pending-onboarding', '1');
      auth.clearSession();
      expect(auth.subscriptionState().status).toBe('none');
      expect(sessionStorage.getItem('mintly-pending-onboarding')).toBeNull();
      expect(localStorage.getItem('mintly-pending-onboarding')).toBeNull();
    });
  });

  describe('onApiError (402 no meio do uso)', () => {
    it('402 SUBSCRIPTION-0001: trata como sem assinatura e leva à tela de assinatura', () => {
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      auth.setSubscriptionEndsAt(new Date(Date.now() + 5 * DAY).toISOString());

      expect(auth.onApiError(response(402, 'SUBSCRIPTION-0001'))).toBe(true);

      expect(auth.hasActiveSubscription()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/assinatura']);
    });

    it('402 no formato ApiError da lib (status e code direto, SEM response): é o que a API real entrega', () => {
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      auth.setSubscriptionEndsAt(new Date(Date.now() + 5 * DAY).toISOString());
      const apiError = Object.assign(new Error('Assinatura necessária.'), {
        code: 'SUBSCRIPTION-0001',
        status: 402,
      });

      expect(auth.onApiError(apiError)).toBe(true);

      expect(auth.hasActiveSubscription()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/assinatura']);
    });

    it('não navega de novo se já está na tela de assinatura (sem laço)', () => {
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      vi.spyOn(router, 'url', 'get').mockReturnValue('/assinatura/retorno');
      expect(auth.onApiError(response(402, 'SUBSCRIPTION-0001'))).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('outros status ou outros códigos são ignorados', () => {
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      expect(auth.onApiError(response(402, 'OUTRO'))).toBe(false);
      expect(auth.onApiError(response(500, 'SUBSCRIPTION-0001'))).toBe(false);
      expect(auth.onApiError(response(401))).toBe(false);
      expect(auth.onApiError(new Error('rede'))).toBe(false);
      expect(auth.onApiError(null)).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('já vencida continua com a data de vencimento original (não a apaga)', () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const past = new Date(Date.now() - 3 * DAY).toISOString();
      auth.setSubscriptionEndsAt(past);
      auth.onApiError(response(402, 'SUBSCRIPTION-0001'));
      expect(auth.subscriptionState().endsAt).toBe(past);
    });
  });

  describe('onboarding pendente (recém-cadastrado)', () => {
    it('depois de pagar vai ao onboarding uma única vez; depois, ao app', () => {
      sessionStorage.setItem('mintly-pending-onboarding', '1');
      expect(auth.consumeNextRouteAfterSubscription()).toBe('/auth/onboarding');
      expect(auth.consumeNextRouteAfterSubscription()).toBe('/');
    });

    it('quem só renova vai direto ao app', () => {
      expect(auth.consumeNextRouteAfterSubscription()).toBe('/');
    });
  });

  describe('login e cadastro (API)', () => {
    const user = { person: { name: 'Ana' }, email: 'ana@x.com', restaurantId: 'r1' };

    it('o login guarda a data limite que a API devolveu', async () => {
      const end = new Date(Date.now() + 9 * DAY).toISOString();
      (auth as unknown as { authClient: unknown }).authClient = {
        login: vi.fn().mockResolvedValue({
          payload: {
            accessToken: 'a',
            refreshToken: 'r',
            user,
            subscription: { status: 'active', endsAt: end },
          },
        }),
      };
      await auth.login('ana@x.com', 'Senha123', true);
      expect(auth.subscriptionState().endsAt).toBe(end);
      expect(auth.hasActiveSubscription()).toBe(true);
    });

    it('o login guarda o tipo (pro) e o logout apaga', async () => {
      const end = new Date(Date.now() + 9 * DAY).toISOString();
      (auth as unknown as { authClient: unknown }).authClient = {
        login: vi.fn().mockResolvedValue({
          payload: {
            accessToken: 'a',
            refreshToken: 'r',
            user,
            subscription: { status: 'active', tier: 'pro', endsAt: end },
          },
        }),
      };
      await auth.login('ana@x.com', 'Senha123', true);
      expect(auth.subscriptionState().tier).toBe('pro');
      expect(localStorage.getItem('mintly-subscription-tier')).toBe('pro');

      auth.setSubscriptionEndsAt(null);
      expect(auth.subscriptionState().tier).toBeNull();
      expect(localStorage.getItem('mintly-subscription-tier')).toBeNull();
    });

    it('conta com data mas sem tipo (liberada à mão) é Básico', async () => {
      auth.setSubscriptionEndsAt(new Date(Date.now() + 9 * DAY).toISOString());
      expect(auth.subscriptionState().tier).toBe('basic');
    });

    it('402 com assinatura Pro ativa mantém o tipo Pro no estado vencido', () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(true);
      auth.setSubscriptionEndsAt(new Date(Date.now() + 5 * DAY).toISOString(), 'pro');
      auth.onApiError({ status: 402, code: 'SUBSCRIPTION-0001' });
      expect(auth.subscriptionState()).toMatchObject({ status: 'expired', tier: 'pro' });
    });

    it('login sem assinatura na resposta: fica sem assinatura (o guard confere com a API)', async () => {
      auth.setSubscriptionEndsAt(new Date(Date.now() + 9 * DAY).toISOString());
      (auth as unknown as { authClient: unknown }).authClient = {
        login: vi
          .fn()
          .mockResolvedValue({ payload: { accessToken: 'a', refreshToken: 'r', user } }),
      };
      await auth.login('ana@x.com', 'Senha123', true);
      expect(auth.subscriptionState().status).toBe('none');
    });

    it('o cadastro deixa a conta sem assinatura e marca o onboarding para depois do pagamento', async () => {
      (auth as unknown as { authClient: unknown }).authClient = {
        signup: vi.fn().mockResolvedValue({
          payload: {
            accessToken: 'a',
            refreshToken: 'r',
            user,
            restaurant: { name: 'Cantina' },
            subscription: { status: 'none', endsAt: null },
          },
        }),
      };
      await auth.signup({
        name: 'Ana',
        phone: '11999999999',
        email: 'ana@x.com',
        password: 'Senha123',
        restaurantName: 'Cantina',
        termsAccepted: true,
      });
      expect(auth.hasActiveSubscription()).toBe(false);
      expect(auth.consumeNextRouteAfterSubscription()).toBe('/auth/onboarding');
    });
  });

  describe('modo mock', () => {
    beforeEach(() => {
      flags.useMocks = true;
    });
    afterEach(() => {
      flags.useMocks = false;
    });

    it('o usuário de demonstração entra com assinatura ativa', async () => {
      await auth.login('ana@seoulbird.com.br', 'mintly123', true);
      expect(auth.hasActiveSubscription()).toBe(true);
      expect(auth.subscriptionState().expiresSoon).toBe(false);
    });

    it('conta nova no mock nasce sem assinatura e com o onboarding para depois', async () => {
      await auth.signup({
        name: 'Novo',
        phone: '11999999999',
        email: `novo${Date.now()}@x.com`,
        password: 'Senha123',
        restaurantName: 'Rest',
        termsAccepted: true,
      });
      expect(auth.hasActiveSubscription()).toBe(false);
      expect(auth.consumeNextRouteAfterSubscription()).toBe('/auth/onboarding');
    });
  });
});
