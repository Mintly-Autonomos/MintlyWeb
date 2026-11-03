import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

const flags = environment as { useMocks: boolean };

const resposta = (
  over: { email?: string; name?: string; avatar?: string; token?: string } = {},
) => ({
  payload: {
    accessToken: `access-${over.token ?? 'x'}`,
    refreshToken: `refresh-${over.token ?? 'x'}`,
    user: {
      email: over.email ?? 'davi@teste.com',
      restaurantId: 'rest-1',
      person: { name: over.name ?? 'Davi Lee', avatar: over.avatar },
    },
    subscription: null,
  },
});

describe('AuthService — conta lembrada neste aparelho', () => {
  let auth: AuthService;
  let login: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;

  function criar(): AuthService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const svc = TestBed.inject(AuthService);
    (svc as unknown as { authClient: unknown }).authClient = { login, refresh, logout };
    return svc;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    flags.useMocks = false;
    login = vi.fn();
    refresh = vi.fn();
    logout = vi.fn().mockResolvedValue({});
    auth = criar();
  });

  afterEach(() => {
    flags.useMocks = false;
  });

  it('entrar com "manter conectado" lembra nome, e-mail e foto (nunca a senha nem o token)', async () => {
    login.mockResolvedValue(resposta({ avatar: 'data:image/png;base64,AAA' }));
    await auth.login('davi@teste.com', 'SenhaSecreta#1', true);

    expect(auth.savedAccount()).toEqual({
      email: 'davi@teste.com',
      nome: 'Davi Lee',
      avatarDataUrl: 'data:image/png;base64,AAA',
    });
    const guardado = localStorage.getItem('mintly-saved-account') ?? '';
    expect(guardado).not.toContain('SenhaSecreta');
    expect(guardado).not.toContain('access-');
    expect(guardado).not.toContain('refresh-');
  });

  it('sem foto no servidor não há ícone', async () => {
    login.mockResolvedValue(resposta());
    await auth.login('davi@teste.com', 'x', true);
    expect(auth.savedAccount()?.avatarDataUrl).toBeUndefined();
    expect(localStorage.getItem('mintly-saved-avatar')).toBeNull();
  });

  it('a conta lembrada sobrevive a recarregar a página', async () => {
    login.mockResolvedValue(resposta({ avatar: 'data:image/png;base64,AAA' }));
    await auth.login('davi@teste.com', 'x', true);
    const depois = criar();
    expect(depois.savedAccount()).toMatchObject({ email: 'davi@teste.com', nome: 'Davi Lee' });
    expect(depois.savedAccount()?.avatarDataUrl).toBe('data:image/png;base64,AAA');
  });

  it('entrar sem "manter conectado" não lembra ninguém', async () => {
    login.mockResolvedValue(resposta());
    await auth.login('davi@teste.com', 'x', false);
    expect(auth.savedAccount()).toBeNull();
  });

  it('entrar sem "manter conectado" com a mesma conta que estava lembrada, esquece (foi a escolha)', async () => {
    login.mockResolvedValue(resposta());
    await auth.login('davi@teste.com', 'x', true);
    await auth.login('DAVI@teste.com', 'x', false);
    expect(auth.savedAccount()).toBeNull();
  });

  it('outra pessoa entrando sem "manter conectado" não apaga a conta lembrada', async () => {
    login.mockResolvedValue(resposta());
    await auth.login('davi@teste.com', 'x', true);
    login.mockResolvedValue(resposta({ email: 'alice@teste.com', name: 'Alice' }));
    await auth.login('alice@teste.com', 'x', false);
    expect(auth.savedAccount()?.email).toBe('davi@teste.com');
  });

  it('sair não esquece a conta: o login seguinte pede só a senha', async () => {
    login.mockResolvedValue(resposta());
    await auth.login('davi@teste.com', 'x', true);
    await auth.logout(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.savedAccount()?.email).toBe('davi@teste.com');
  });

  it('"usar outra conta" esquece a conta lembrada, inclusive depois de recarregar', async () => {
    login.mockResolvedValue(resposta({ avatar: 'data:image/png;base64,AAA' }));
    await auth.login('davi@teste.com', 'x', true);
    auth.forgetSavedAccount();
    expect(auth.savedAccount()).toBeNull();
    expect(criar().savedAccount()).toBeNull();
    expect(localStorage.getItem('mintly-saved-avatar')).toBeNull();
  });

  it('trocar a foto de perfil atualiza o ícone da conta lembrada', async () => {
    login.mockResolvedValue(resposta());
    await auth.login('davi@teste.com', 'x', true);
    (auth as unknown as { applyAvatar(a: string | undefined): void }).applyAvatar(
      'data:image/png;base64,BBB',
    );
    expect(auth.savedAccount()?.avatarDataUrl).toBe('data:image/png;base64,BBB');
  });

  it('dado inválido guardado não derruba a tela de login', () => {
    localStorage.setItem('mintly-saved-account', '{não é json');
    expect(criar().savedAccount()).toBeNull();
    localStorage.setItem('mintly-saved-account', JSON.stringify({ email: 5 }));
    expect(criar().savedAccount()).toBeNull();
  });
});

describe('AuthService — uma sessão não herda dados de outra', () => {
  let login: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;

  function criar(): AuthService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const svc = TestBed.inject(AuthService);
    (svc as unknown as { authClient: unknown }).authClient = { login, refresh };
    return svc;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    flags.useMocks = false;
    login = vi.fn();
    refresh = vi.fn();
  });

  it('entrar sem "manter conectado" tira a sessão que outra pessoa deixou guardada no aparelho', async () => {
    // Alice ficou "conectada" neste navegador.
    localStorage.setItem('mintly-remember', '1');
    localStorage.setItem('mintly-access-token', 'access-alice');
    localStorage.setItem('mintly-refresh-token', 'refresh-alice');
    localStorage.setItem(
      'mintly-user',
      JSON.stringify({ nome: 'Alice', email: 'alice@teste.com' }),
    );

    const auth = criar();
    login.mockResolvedValue(resposta({ token: 'davi' }));
    await auth.login('davi@teste.com', 'x', false);

    expect(localStorage.getItem('mintly-access-token')).toBeNull();
    expect(localStorage.getItem('mintly-refresh-token')).toBeNull();
    expect(localStorage.getItem('mintly-user')).toBeNull();

    // Fechou a aba e abriu de novo: não pode entrar como a Alice.
    sessionStorage.clear();
    const reaberto = criar();
    expect(reaberto.isAuthenticated()).toBe(false);
    expect(reaberto.currentUser()).toBeNull();
  });

  it('entrar com "manter conectado" tira a sessão que ficou só na aba', async () => {
    sessionStorage.setItem('mintly-access-token', 'access-antigo');
    sessionStorage.setItem('mintly-refresh-token', 'refresh-antigo');
    sessionStorage.setItem(
      'mintly-user',
      JSON.stringify({ nome: 'Antigo', email: 'antigo@teste.com' }),
    );

    const auth = criar();
    login.mockResolvedValue(resposta({ token: 'davi' }));
    await auth.login('davi@teste.com', 'x', true);

    expect(sessionStorage.getItem('mintly-access-token')).toBeNull();
    expect(sessionStorage.getItem('mintly-user')).toBeNull();
    expect(auth.currentUser()?.nome).toBe('Davi Lee');
    expect(criar().currentUser()?.nome).toBe('Davi Lee');
  });

  it('a renovação de uma sessão só da aba não grava no localStorage, mesmo que outra aba tenha ligado "manter conectado"', async () => {
    // Esta aba: sessão sem "manter conectado" (sessionStorage).
    sessionStorage.setItem('mintly-access-token', 'access-1');
    sessionStorage.setItem('mintly-refresh-token', 'refresh-1');
    // Outra aba entrou com "manter conectado" e deixou essa marca no aparelho.
    localStorage.setItem('mintly-remember', '1');
    localStorage.setItem('mintly-access-token', 'access-outra-pessoa');
    localStorage.setItem('mintly-refresh-token', 'refresh-outra-pessoa');

    const auth = criar();
    refresh.mockResolvedValue({ payload: { accessToken: 'access-2', refreshToken: 'refresh-2' } });
    await auth.refresh();

    expect(sessionStorage.getItem('mintly-refresh-token')).toBe('refresh-2');
    expect(localStorage.getItem('mintly-refresh-token')).toBe('refresh-outra-pessoa');
    expect(localStorage.getItem('mintly-access-token')).toBe('access-outra-pessoa');
  });
});
