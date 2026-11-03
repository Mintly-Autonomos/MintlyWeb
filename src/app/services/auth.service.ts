import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { computeSubscriptionState } from 'mintly-lib';
import type { Headers, SubscriptionState, SubscriptionTier } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { MintlyClientService } from './mintly-client.service';
import { apiErrorInfo } from '../shared/api-error';
import mockAuth from '../mocks/mock_auth.json';

export interface AuthUser {
  nome: string;
  email: string;
  empresa?: string;
  /** Necessário para montar payloads de criação (a API reforça o valor real no servidor). */
  restaurantId?: string;
  /** Foto de perfil (data URL) — vem do servidor no login/signup (`user.person.avatar`). */
  avatarDataUrl?: string;
}

/**
 * Conta lembrada neste aparelho (só quando a pessoa marcou "Manter conectado"): a tela de login mostra
 * quem é e pede só a senha. Nunca guarda senha nem token.
 */
export interface SavedAccount {
  email: string;
  nome: string;
  /** Foto de perfil vinda do servidor; sem foto não há ícone. */
  avatarDataUrl?: string;
}

interface MockRegisteredUser {
  name: string;
  email: string;
  password: string;
  restaurantName: string;
  restaurantId: string;
  avatar?: string;
  /** Modo mock: data limite da assinatura (ISO); `null` = nunca assinou. */
  subscriptionEndsAt?: string | null;
  subscriptionTier?: SubscriptionTier | null;
}

const REMEMBER_KEY = 'mintly-remember';
const KEYS = {
  access: 'mintly-access-token',
  refresh: 'mintly-refresh-token',
  user: 'mintly-user',
  /** Data limite da assinatura (ISO). O estado (ativa/vencida) é calculado na hora, não guardado. */
  subscription: 'mintly-subscription-ends',
  /** Tipo da assinatura (basic | pro). */
  subscriptionTier: 'mintly-subscription-tier',
  /** Quando o token de acesso atual foi emitido (ms): é ele que diz quando renovar em silêncio. */
  accessIssuedAt: 'mintly-access-issued-at',
} as const;
/** Onde a pessoa estava quando a sessão acabou sem ela pedir: o login devolve para lá. */
const RETURN_URL_KEY = 'mintly-return-url';
const RETURN_URL_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/**
 * O token de acesso dura 15 min. Renova a partir daqui, em silêncio, para a pessoa nunca bater num 401
 * (a margem cobre o ciclo de 15 s do monitor e uma rede lenta).
 */
const RENEW_AFTER_MS = 10 * 60 * 1000;
const TOKEN_KEYS: string[] = [KEYS.access, KEYS.refresh];
const AVATAR_KEY = 'mintly-avatar';
const SAVED_ACCOUNT_KEY = 'mintly-saved-account';
const SAVED_AVATAR_KEY = 'mintly-saved-avatar';

/**
 * Seed do modo mock (`environment.useMocks: true`, só local) — restaurante de demonstração
 * (Seoul Bird) de `mocks/mock_auth.json`. Ganha uma entrada nova a cada signup feito em modo
 * mock; dura só a sessão da aba. Sem efeito nenhum quando `useMocks` é false (padrão).
 */
// O usuário de demonstração entra com assinatura ativa (20 dias), para o app abrir direto.
const registeredUsers: MockRegisteredUser[] = [
  {
    ...mockAuth.user,
    subscriptionEndsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    subscriptionTier: 'basic',
  },
];

function delay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeToken(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private authClient = inject(MintlyClientService).client.authClient;
  private personClient = inject(MintlyClientService).client.personClient;

  // "Manter conectado" => localStorage (persiste); senão => sessionStorage (só a aba).
  // Vale ONDE ESTÁ a sessão desta aba, não o último valor gravado: outra aba entrando com "manter conectado"
  // mudava essa opção e a renovação de uma sessão sem "manter" passava a gravar no localStorage, trocando a
  // sessão guardada por outra pessoa.
  private remember = this.sessionIsRemembered();

  private _saved = signal<SavedAccount | null>(this.loadSavedAccount());
  /** Conta lembrada neste aparelho (para o login pedir só a senha). */
  readonly savedAccount = this._saved.asReadonly();

  private _accessToken = signal<string | null>(this.read(KEYS.access));
  private _refreshToken = signal<string | null>(this.read(KEYS.refresh));
  private _user = signal<AuthUser | null>(this.loadStoredUser());
  private _subscriptionEndsAt = signal<string | null>(this.read(KEYS.subscription));
  private _subscriptionTier = signal<string | null>(this.read(KEYS.subscriptionTier));

  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly currentUser = this._user.asReadonly();

  /** Renovação em andamento: quem pede enquanto ela roda espera por ela, em vez de gastar o token de novo. */
  private refreshInFlight: Promise<boolean> | null = null;

  /**
   * Uma sessão que existia acabou agora (a API recusou o token de renovação). É o que diferencia "Sua sessão
   * expirou" de quem simplesmente ainda não entrou: este visitante deve ver o login, não um aviso de expiração.
   */
  private sessionEnded = false;

  constructor() {
    // Outra aba renovou ou saiu: esta passa a usar os tokens novos. Com o token antigo ela tentaria
    // renovar de novo e a API (token de renovação é de uso único) derrubaria a sessão inteira.
    window.addEventListener('storage', (e) => {
      if (e.key === null || TOKEN_KEYS.includes(e.key)) this.syncTokensFromStorage();
    });
  }

  /**
   * Estado da assinatura NESTE instante (ativa só enquanto agora < data limite; mesma regra da API,
   * vinda da lib). Calculado a cada leitura: uma assinatura que vence com o app aberto vira "vencida"
   * na próxima navegação, sem esperar um novo login.
   */
  subscriptionState(): SubscriptionState {
    return computeSubscriptionState(
      this._subscriptionEndsAt(),
      new Date(),
      this._subscriptionTier(),
    );
  }

  hasActiveSubscription(): boolean {
    return this.subscriptionState().status === 'active';
  }

  /** Guarda a data limite e o tipo que a API informou (login, cadastro ou GET /subscription). */
  setSubscriptionEndsAt(endsAt: string | null, tier?: SubscriptionTier | null): void {
    this._subscriptionEndsAt.set(endsAt);
    if (endsAt) this.write(KEYS.subscription, endsAt);
    else this.remove(KEYS.subscription);
    this._subscriptionTier.set(endsAt && tier ? tier : null);
    if (endsAt && tier) this.write(KEYS.subscriptionTier, tier);
    else this.remove(KEYS.subscriptionTier);
  }

  /**
   * A API respondeu 402 SUBSCRIPTION-0001: a assinatura venceu (ou nunca existiu) com o app aberto.
   * Trata como sem assinatura e leva à tela de assinatura. Devolve true quando era esse erro.
   */
  onApiError(err: unknown): boolean {
    const { status, code } = apiErrorInfo(err);
    if (status !== 402 || code !== 'SUBSCRIPTION-0001') return false;
    if (this.hasActiveSubscription()) {
      this.setSubscriptionEndsAt(new Date(0).toISOString(), this.subscriptionState().tier);
    }
    if (!this.router.url.startsWith('/assinatura')) this.router.navigate(['/assinatura']);
    return true;
  }

  private sessionIsRemembered(): boolean {
    const inLocal = localStorage.getItem(KEYS.access) !== null;
    const inSession = sessionStorage.getItem(KEYS.access) !== null;
    if (inSession) return false;
    if (inLocal) return true;
    return localStorage.getItem(REMEMBER_KEY) === '1';
  }

  private loadSavedAccount(): SavedAccount | null {
    try {
      const raw = localStorage.getItem(SAVED_ACCOUNT_KEY);
      if (!raw) return null;
      const acc = JSON.parse(raw) as Partial<SavedAccount>;
      if (typeof acc.email !== 'string' || !acc.email || typeof acc.nome !== 'string') return null;
      const avatarDataUrl = localStorage.getItem(SAVED_AVATAR_KEY) ?? undefined;
      return { email: acc.email, nome: acc.nome, ...(avatarDataUrl ? { avatarDataUrl } : {}) };
    } catch {
      return null;
    }
  }

  /** Guarda a conta neste aparelho (nome, e-mail e foto; nunca a senha). */
  private saveAccount(user: AuthUser): void {
    const acc: SavedAccount = {
      email: user.email,
      nome: user.nome,
      ...(user.avatarDataUrl ? { avatarDataUrl: user.avatarDataUrl } : {}),
    };
    this._saved.set(acc);
    try {
      localStorage.setItem(SAVED_ACCOUNT_KEY, JSON.stringify({ email: acc.email, nome: acc.nome }));
      if (acc.avatarDataUrl) localStorage.setItem(SAVED_AVATAR_KEY, acc.avatarDataUrl);
      else localStorage.removeItem(SAVED_AVATAR_KEY);
    } catch {
      /* sem cota: a foto vale só nesta aba; nome e e-mail seguem guardados quando couberem */
    }
  }

  /** Esquece a conta lembrada neste aparelho (o login volta a pedir e-mail e senha). */
  forgetSavedAccount(): void {
    this._saved.set(null);
    localStorage.removeItem(SAVED_ACCOUNT_KEY);
    localStorage.removeItem(SAVED_AVATAR_KEY);
  }

  /** Depois de entrar: com "manter conectado" lembra a conta; sem ele, esquece a mesma conta se estava lembrada. */
  private syncSavedAccount(remember: boolean, user: AuthUser): void {
    if (remember) {
      this.saveAccount(user);
      return;
    }
    const saved = this._saved();
    if (saved && saved.email.toLowerCase() === user.email.toLowerCase()) this.forgetSavedAccount();
  }

  /** Storage ativo conforme a opção "manter conectado". */
  private get store(): Storage {
    return this.remember ? localStorage : sessionStorage;
  }
  /** Lê de qualquer um dos storages (o token pode estar em qualquer um). */
  private read(key: string): string | null {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  }
  private write(key: string, value: string): void {
    this.store.setItem(key, value);
  }
  private remove(key: string): void {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  /** Header de contexto exigido pelos clients da mintly-lib. */
  private get headers(): Headers {
    return { env: environment.mintlyEnv };
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  /** Troca a foto de perfil (data URL já validada). Em 401 renova o token e tenta de novo. */
  async updateAvatar(dataUrl: string): Promise<void> {
    if (environment.useMocks) {
      await delay(300);
      this.setMockAvatar(dataUrl);
    } else {
      await this.authed((headers) =>
        this.personClient.updateMyAvatar({ avatar: dataUrl }, headers),
      );
    }
    this.applyAvatar(dataUrl);
  }

  /** Remove a foto de perfil (volta pras iniciais). */
  async removeAvatar(): Promise<void> {
    if (environment.useMocks) {
      await delay(300);
      this.setMockAvatar(undefined);
    } else {
      await this.authed((headers) => this.personClient.removeMyAvatar(headers));
    }
    this.applyAvatar(undefined);
  }

  private async authed<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    const headers = (): Headers => ({
      env: environment.mintlyEnv,
      authorization: `Bearer ${this._accessToken()}`,
    });
    try {
      return await fn(headers());
    } catch (err) {
      const status = apiErrorInfo(err).status;
      if (status === 401 && (await this.refresh())) return await fn(headers());
      throw err;
    }
  }

  private setMockAvatar(avatar: string | undefined): void {
    const email = this._user()?.email.toLowerCase();
    const mock = registeredUsers.find((u) => u.email.toLowerCase() === email);
    if (mock) mock.avatar = avatar;
  }

  private applyAvatar(avatarDataUrl: string | undefined): void {
    this._user.update((u) => (u ? { ...u, avatarDataUrl } : u));
    const user = this._user();
    const saved = this._saved();
    if (user && saved && saved.email.toLowerCase() === user.email.toLowerCase()) {
      this.saveAccount(user);
    }
    try {
      if (avatarDataUrl) this.write(AVATAR_KEY, avatarDataUrl);
      else this.remove(AVATAR_KEY);
    } catch {
      /* sem cota: a foto vale só nesta sessão */
    }
  }

  async login(email: string, password: string, remember = true): Promise<void> {
    this.remember = remember;
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');

    if (environment.useMocks) {
      await delay();
      const match = registeredUsers.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
      );
      if (!match) throw new Error('E-mail ou senha inválidos.');
      const entered: AuthUser = {
        nome: match.name,
        email: match.email,
        empresa: match.restaurantName,
        restaurantId: match.restaurantId,
        avatarDataUrl: match.avatar,
      };
      this.persistTokens(fakeToken('mock-access'), fakeToken('mock-refresh'), entered);
      this.syncSavedAccount(remember, entered);
      this.setSubscriptionEndsAt(match.subscriptionEndsAt ?? null, match.subscriptionTier);
      return;
    }

    const response = await this.authClient.login({ email, password }, this.headers);
    const result = response.payload;
    if (!result) throw new Error('Resposta de login sem payload.');
    const entered: AuthUser = {
      nome: result.user.person.name,
      email: result.user.email,
      restaurantId: result.user.restaurantId,
      avatarDataUrl: result.user.person.avatar,
    };
    this.persistTokens(result.accessToken, result.refreshToken, entered);
    this.syncSavedAccount(remember, entered);
    this.setSubscriptionEndsAt(result.subscription?.endsAt ?? null, result.subscription?.tier);
  }

  /** Cadastro inicial (usuário + restaurante). Já autentica com os tokens retornados. */
  async signup(input: {
    name: string;
    phone: string;
    avatar?: string;
    email: string;
    password: string;
    restaurantName: string;
    termsAccepted: boolean;
  }): Promise<void> {
    this.remember = true;
    localStorage.setItem(REMEMBER_KEY, '1');

    if (environment.useMocks) {
      await delay();
      const email = input.email.trim().toLowerCase();
      if (registeredUsers.some((u) => u.email.toLowerCase() === email)) {
        throw new Error('Este e-mail já está cadastrado.');
      }
      const restaurantId = `rest-${Date.now()}`;
      registeredUsers.push({
        name: input.name,
        email: input.email,
        password: input.password,
        restaurantName: input.restaurantName,
        restaurantId,
        avatar: input.avatar,
        subscriptionEndsAt: null,
      });
      const created: AuthUser = {
        nome: input.name,
        email: input.email,
        empresa: input.restaurantName,
        restaurantId,
        avatarDataUrl: input.avatar,
      };
      this.persistTokens(fakeToken('mock-access'), fakeToken('mock-refresh'), created);
      this.syncSavedAccount(true, created);
      this.setSubscriptionEndsAt(null);
      return;
    }

    const response = await this.authClient.signup(
      {
        person: { name: input.name, phone: input.phone, avatar: input.avatar },
        email: input.email,
        password: input.password,
        restaurantName: input.restaurantName,
        termsAccepted: input.termsAccepted,
      },
      this.headers,
    );
    const result = response.payload;
    if (!result) throw new Error('Resposta de cadastro sem payload.');
    const created: AuthUser = {
      nome: result.user.person.name,
      email: result.user.email,
      empresa: result.restaurant.name,
      restaurantId: result.user.restaurantId,
      avatarDataUrl: result.user.person.avatar,
    };
    this.persistTokens(result.accessToken, result.refreshToken, created);
    this.syncSavedAccount(true, created);
    // Conta nova nunca tem assinatura: a tela de assinatura vem antes de tudo.
    this.setSubscriptionEndsAt(result.subscription?.endsAt ?? null, result.subscription?.tier);
  }

  /** Dispara o e-mail de recuperação. Resposta é sempre genérica (não revela se o e-mail existe). */
  async forgotPassword(email: string): Promise<string> {
    if (environment.useMocks) {
      await delay(300);
      return 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.';
    }
    const response = await this.authClient.forgotPassword(email, this.headers);
    return (
      response.payload?.message ??
      'Se o e-mail estiver cadastrado, você receberá as instruções em breve.'
    );
  }

  /** Redefine a senha a partir do token recebido por e-mail. */
  async resetPassword(
    token: string,
    newPassword: string,
    confirmNewPassword: string,
  ): Promise<string> {
    if (environment.useMocks) {
      await delay(300);
      if (newPassword !== confirmNewPassword) throw new Error('As senhas não coincidem.');
      return 'Senha redefinida com sucesso.';
    }
    const response = await this.authClient.resetPassword(
      { token, newPassword, confirmNewPassword },
      this.headers,
    );
    return response.payload?.message ?? 'Senha redefinida com sucesso.';
  }

  /**
   * Renova o token de acesso. `true`: renovou (ou outra aba já tinha renovado). `false`: a API
   * recusou o token de renovação de vez (sessão acabou, já foi limpa). Se a rede ou o servidor falharem
   * o erro SOBE e a sessão fica como está: queda de conexão não pode deslogar ninguém.
   *
   * Uma renovação por vez: o token de renovação é de uso único, e usá-lo duas vezes (duas requisições
   * que vencem juntas, ou duas abas) faz a API revogar a sessão inteira por suspeita de roubo.
   */
  refresh(): Promise<boolean> {
    this.refreshInFlight ??= this.withRefreshLock(() => this.doRefresh()).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  /** Renova em silêncio quando o token de acesso está perto de vencer. Falha de rede fica para o próximo ciclo. */
  async renewIfDue(): Promise<void> {
    if (environment.useMocks || !this._accessToken()) return;
    const issuedAt = Number(this.read(KEYS.accessIssuedAt));
    if (issuedAt && Date.now() - issuedAt < RENEW_AFTER_MS) return;
    try {
      await this.refresh();
    } catch {
      /* sem rede agora: a próxima checagem tenta de novo */
    }
  }

  /** Entre abas, uma renovação por vez (Web Locks); sem o recurso, vale só a trava desta aba. */
  private withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    return locks ? (locks.request('mintly-refresh', fn) as Promise<T>) : fn();
  }

  private async doRefresh(): Promise<boolean> {
    const before = this._accessToken();
    // Outra aba pode ter renovado enquanto esta esperava a vez: então já há token novo, é só usar.
    this.syncTokensFromStorage();
    if (!this._refreshToken()) return false;
    if (this._accessToken() !== before) return true;

    if (environment.useMocks) {
      const at = fakeToken('mock-access');
      this._accessToken.set(at);
      this.write(KEYS.access, at);
      this.write(KEYS.accessIssuedAt, String(Date.now()));
      return true;
    }

    try {
      const response = await this.authClient.refresh(this._refreshToken()!, this.headers);
      const result = response.payload;
      if (!result) throw new Error('Resposta de refresh sem payload.');
      this._accessToken.set(result.accessToken);
      this.write(KEYS.access, result.accessToken);
      this.write(KEYS.accessIssuedAt, String(Date.now()));
      if (result.refreshToken) {
        this._refreshToken.set(result.refreshToken);
        this.write(KEYS.refresh, result.refreshToken);
      }
      return true;
    } catch (err) {
      const status = apiErrorInfo(err).status;
      // Só a recusa da API encerra a sessão; rede fora, timeout ou erro 5xx tentam de novo depois.
      if (status === 401 || status === 403) {
        this.rememberReturnUrl();
        this.clearSession();
        this.sessionEnded = true;
        return false;
      }
      throw err;
    }
  }

  /** Alinha os tokens desta aba com o que está guardado (outra aba pode ter renovado ou saído). */
  private syncTokensFromStorage(): void {
    this._accessToken.set(this.read(KEYS.access));
    this._refreshToken.set(this.read(KEYS.refresh));
    if (!this._accessToken()) this._user.set(null);
  }

  /** Uma sessão acabou agora? Responde uma vez só (a tela "sessão expirada" usa para abrir). */
  consumeSessionEnded(): boolean {
    const ended = this.sessionEnded;
    this.sessionEnded = false;
    return ended;
  }

  /** Guarda a tela atual para o login devolver a pessoa a ela depois que a sessão acabar sem ela pedir. */
  rememberReturnUrl(): void {
    const url = this.router.url;
    if (!url || url === '/' || url.startsWith('/auth') || url.startsWith('/assinatura')) return;
    try {
      localStorage.setItem(RETURN_URL_KEY, JSON.stringify({ url, at: Date.now() }));
    } catch {
      /* sem storage: o login volta para o início */
    }
  }

  /** A tela em que a pessoa estava (uma vez só); `null` se não há, é antiga ou não é um caminho do app. */
  consumeReturnUrl(): string | null {
    let url: string | null = null;
    try {
      const raw = localStorage.getItem(RETURN_URL_KEY);
      localStorage.removeItem(RETURN_URL_KEY);
      const saved = raw ? (JSON.parse(raw) as { url?: unknown; at?: unknown }) : null;
      if (
        saved &&
        typeof saved.url === 'string' &&
        typeof saved.at === 'number' &&
        Date.now() - saved.at < RETURN_URL_MAX_AGE_MS &&
        saved.url.startsWith('/') &&
        !saved.url.startsWith('//')
      ) {
        url = saved.url;
      }
    } catch {
      /* guardado estragado: ignora */
    }
    return url;
  }

  /** Há uma tela guardada para voltar? (só olha, não consome). */
  hasReturnUrl(): boolean {
    try {
      return !!localStorage.getItem(RETURN_URL_KEY);
    } catch {
      return false;
    }
  }

  /**
   * `redirect`: false quando a tela de despedida (`/auth/logout`) é o destino. Sair a pedido da pessoa
   * esquece a tela guardada; `keepReturnUrl` (sessão que acabou por inatividade) mantém para o login voltar nela.
   */
  async logout(redirect = true, keepReturnUrl = false): Promise<void> {
    if (!environment.useMocks) {
      const rt = this._refreshToken();
      const at = this._accessToken();
      if (rt && at) {
        try {
          await this.authClient.logout(rt, { ...this.headers, authorization: `Bearer ${at}` });
        } catch {
          /* best effort */
        }
      }
    }
    this.clearSession();
    if (!keepReturnUrl) localStorage.removeItem(RETURN_URL_KEY);
    if (redirect) this.router.navigate(['/auth/login']);
  }

  private persistTokens(accessToken: string, refreshToken: string | null, user: AuthUser): void {
    // Antes de gravar a sessão nova, tira a anterior dos DOIS storages: sobrar token de outra pessoa no outro
    // storage fazia o app entrar direto com a conta errada ao reabrir ou em outra aba.
    this.clearSession();
    this._accessToken.set(accessToken);
    this._refreshToken.set(refreshToken);
    this._user.set(user);
    this.write(KEYS.access, accessToken);
    this.write(KEYS.accessIssuedAt, String(Date.now()));
    if (refreshToken) this.write(KEYS.refresh, refreshToken);
    // A foto (até ~1,4 MB em base64) fica numa chave própria: se estourar a cota do storage,
    // só ela se perde (volta pras iniciais) — o login não pode quebrar por causa de um enfeite.
    const { avatarDataUrl, ...rest } = user;
    this.write(KEYS.user, JSON.stringify(rest));
    try {
      if (avatarDataUrl) this.write(AVATAR_KEY, avatarDataUrl);
      else this.remove(AVATAR_KEY);
    } catch {
      /* sem cota: segue sem cache da foto */
    }
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    this.remove(KEYS.access);
    this.remove(KEYS.accessIssuedAt);
    this.remove(KEYS.refresh);
    this.remove(KEYS.user);
    this.remove(AVATAR_KEY);
    this._subscriptionEndsAt.set(null);
    this.remove(KEYS.subscription);
    this._subscriptionTier.set(null);
    this.remove(KEYS.subscriptionTier);
  }

  private loadStoredUser(): AuthUser | null {
    const raw = this.read(KEYS.user);
    if (!raw) return null;
    try {
      const user: AuthUser = JSON.parse(raw);
      const avatarDataUrl = this.read(AVATAR_KEY);
      return avatarDataUrl ? { ...user, avatarDataUrl } : user;
    } catch {
      return null;
    }
  }
}
