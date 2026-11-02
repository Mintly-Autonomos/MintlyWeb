import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

const flags = environment as { useMocks: boolean };
const MIN = 60 * 1000;

describe('AuthService — renovação do token', () => {
  let auth: AuthService;
  let router: Router;
  let refreshCall: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    flags.useMocks = false;
    localStorage.setItem('mintly-remember', '1');
    localStorage.setItem('mintly-access-token', 'access-1');
    localStorage.setItem('mintly-refresh-token', 'refresh-1');
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    refreshCall = vi.fn();
    (auth as unknown as { authClient: unknown }).authClient = { refresh: refreshCall };
  });

  afterEach(() => {
    flags.useMocks = false;
    vi.useRealTimers();
  });

  const apiOk = (n: number) => ({
    payload: { accessToken: `access-${n}`, refreshToken: `refresh-${n}` },
  });
  const httpError = (status?: number) =>
    status === undefined ? new Error('Network Error') : { response: { status, data: {} } };

  it('várias requisições vencendo juntas renovam UMA vez só (o token de renovação é de uso único)', async () => {
    refreshCall.mockResolvedValue(apiOk(2));
    const results = await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);
    expect(results).toEqual([true, true, true]);
    expect(refreshCall).toHaveBeenCalledTimes(1);
    expect(refreshCall.mock.calls[0][0]).toBe('refresh-1');
    expect(auth.getAccessToken()).toBe('access-2');
  });

  it('a renovação seguinte usa o token de renovação novo, nunca o já gasto', async () => {
    refreshCall.mockResolvedValueOnce(apiOk(2)).mockResolvedValueOnce(apiOk(3));
    await auth.refresh();
    await auth.refresh();
    expect(refreshCall.mock.calls.map(([rt]) => rt)).toEqual(['refresh-1', 'refresh-2']);
  });

  it('sem rede: não desloga, o erro sobe e a sessão continua guardada', async () => {
    refreshCall.mockRejectedValue(httpError());
    await expect(auth.refresh()).rejects.toThrow('Network Error');
    expect(auth.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('mintly-refresh-token')).toBe('refresh-1');
  });

  it('erro 500 do servidor também não desloga', async () => {
    refreshCall.mockRejectedValue(httpError(500));
    await expect(auth.refresh()).rejects.toBeDefined();
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('depois de uma queda de rede dá para tentar de novo e funciona', async () => {
    refreshCall.mockRejectedValueOnce(httpError()).mockResolvedValueOnce(apiOk(2));
    await expect(auth.refresh()).rejects.toBeDefined();
    await expect(auth.refresh()).resolves.toBe(true);
    expect(auth.getAccessToken()).toBe('access-2');
  });

  it('a API recusar o token de renovação (401) encerra a sessão e devolve false', async () => {
    refreshCall.mockRejectedValue(httpError(401));
    await expect(auth.refresh()).resolves.toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('mintly-refresh-token')).toBeNull();
  });

  describe('"sessão expirada" só para quem tinha sessão', () => {
    it('token de renovação recusado: avisa que uma sessão acabou, uma vez só', async () => {
      refreshCall.mockRejectedValue(httpError(401));
      await auth.refresh();
      expect(auth.consumeSessionEnded()).toBe(true);
      expect(auth.consumeSessionEnded()).toBe(false);
    });

    it('visitante sem sessão (sem token de renovação): NÃO conta como sessão que acabou', async () => {
      localStorage.clear();
      sessionStorage.clear();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const visitor = TestBed.inject(AuthService);
      await expect(visitor.refresh()).resolves.toBe(false);
      expect(visitor.consumeSessionEnded()).toBe(false);
    });

    it('queda de rede ou erro 500: a sessão não acabou', async () => {
      refreshCall.mockRejectedValue(httpError());
      await expect(auth.refresh()).rejects.toBeDefined();
      expect(auth.consumeSessionEnded()).toBe(false);
    });
  });

  it('outra aba já renovou: usa os tokens novos sem gastar o token de renovação', async () => {
    localStorage.setItem('mintly-access-token', 'access-9');
    localStorage.setItem('mintly-refresh-token', 'refresh-9');
    await expect(auth.refresh()).resolves.toBe(true);
    expect(refreshCall).not.toHaveBeenCalled();
    expect(auth.getAccessToken()).toBe('access-9');
  });

  it('outra aba saiu da conta: devolve false sem chamar a API', async () => {
    localStorage.removeItem('mintly-access-token');
    localStorage.removeItem('mintly-refresh-token');
    await expect(auth.refresh()).resolves.toBe(false);
    expect(refreshCall).not.toHaveBeenCalled();
  });

  describe('renovação silenciosa (renewIfDue)', () => {
    it('token recém-emitido: não renova', async () => {
      localStorage.setItem('mintly-access-issued-at', String(Date.now()));
      await auth.renewIfDue();
      expect(refreshCall).not.toHaveBeenCalled();
    });

    it('perto de vencer (10 min depois): renova sozinho', async () => {
      refreshCall.mockResolvedValue(apiOk(2));
      localStorage.setItem('mintly-access-issued-at', String(Date.now() - 11 * MIN));
      await auth.renewIfDue();
      expect(refreshCall).toHaveBeenCalledTimes(1);
      expect(auth.getAccessToken()).toBe('access-2');
      // e o relógio do token novo recomeça
      await auth.renewIfDue();
      expect(refreshCall).toHaveBeenCalledTimes(1);
    });

    it('sessão antiga, sem data de emissão guardada: renova uma vez', async () => {
      refreshCall.mockResolvedValue(apiOk(2));
      await auth.renewIfDue();
      expect(refreshCall).toHaveBeenCalledTimes(1);
    });

    it('sem rede: não estoura nem desloga (tenta no próximo ciclo)', async () => {
      refreshCall.mockRejectedValue(httpError());
      localStorage.setItem('mintly-access-issued-at', String(Date.now() - 14 * MIN));
      await expect(auth.renewIfDue()).resolves.toBeUndefined();
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('sem login não faz nada', async () => {
      auth.clearSession();
      await auth.renewIfDue();
      expect(refreshCall).not.toHaveBeenCalled();
    });
  });

  describe('voltar para a tela em que estava', () => {
    const at = (url: string) => vi.spyOn(router, 'url', 'get').mockReturnValue(url);

    it('guarda a tela e o login devolve a pessoa a ela, uma vez só', () => {
      at('/custos?canal=delivery');
      auth.rememberReturnUrl();
      expect(auth.hasReturnUrl()).toBe(true);
      expect(auth.consumeReturnUrl()).toBe('/custos?canal=delivery');
      expect(auth.consumeReturnUrl()).toBeNull();
    });

    it.each(['/', '/auth/login', '/auth/sessao-expirada', '/assinatura/retorno'])(
      'não guarda %s (não há para onde voltar)',
      (url) => {
        at(url);
        auth.rememberReturnUrl();
        expect(auth.hasReturnUrl()).toBe(false);
      },
    );

    it('a API recusar o token de renovação guarda a tela antes de limpar a sessão', async () => {
      at('/movimentacoes');
      refreshCall.mockRejectedValue(httpError(401));
      await auth.refresh();
      expect(auth.consumeReturnUrl()).toBe('/movimentacoes');
    });

    it('sair a pedido da pessoa esquece a tela guardada; por inatividade, mantém', async () => {
      flags.useMocks = true;
      at('/receitas');
      auth.rememberReturnUrl();
      await auth.logout(false);
      expect(auth.hasReturnUrl()).toBe(false);

      auth.rememberReturnUrl();
      await auth.logout(false, true);
      expect(auth.consumeReturnUrl()).toBe('/receitas');
    });

    it('tela guardada há mais de 12 horas é ignorada', () => {
      localStorage.setItem(
        'mintly-return-url',
        JSON.stringify({ url: '/custos', at: Date.now() - 13 * 60 * MIN }),
      );
      expect(auth.consumeReturnUrl()).toBeNull();
    });

    it.each(['//evil.com', 'https://evil.com', 'javascript:alert(1)'])(
      'endereço de fora (%s) nunca é usado',
      (url) => {
        localStorage.setItem('mintly-return-url', JSON.stringify({ url, at: Date.now() }));
        expect(auth.consumeReturnUrl()).toBeNull();
      },
    );

    it('guardado estragado é ignorado', () => {
      localStorage.setItem('mintly-return-url', '{nao-e-json');
      expect(auth.consumeReturnUrl()).toBeNull();
    });
  });
});
