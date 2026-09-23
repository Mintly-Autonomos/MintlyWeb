import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { MintlyClientService } from './mintly-client.service';

export interface AuthUser {
  nome: string;
  email: string;
  empresa?: string;
  /** Necessário para montar payloads de criação (a API reforça o valor real no servidor). */
  restaurantId?: string;
  /** Ver TODO(débito técnico) em `saveAvatar` — hoje é só um cache local, não vem do servidor. */
  avatarDataUrl?: string;
}

const REMEMBER_KEY = 'mintly-remember';
const KEYS = {
  access: 'mintly-access-token',
  refresh: 'mintly-refresh-token',
  user: 'mintly-user',
} as const;
const AVATAR_KEY_PREFIX = 'mintly-avatar:';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private authClient = inject(MintlyClientService).client.authClient;

  // "Manter conectado" => localStorage (persiste); senão => sessionStorage (só a aba).
  private remember = localStorage.getItem(REMEMBER_KEY) === '1';

  private _accessToken = signal<string | null>(this.read(KEYS.access));
  private _refreshToken = signal<string | null>(this.read(KEYS.refresh));
  private _user = signal<AuthUser | null>(this.loadStoredUser());

  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly currentUser = this._user.asReadonly();

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

  async login(email: string, password: string, remember = true): Promise<void> {
    this.remember = remember;
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    const response = await this.authClient.login({ email, password }, this.headers);
    const result = response.payload;
    if (!result) throw new Error('Resposta de login sem payload.');
    this.persistTokens(result.accessToken, result.refreshToken, {
      nome: result.user.person.name,
      email: result.user.email,
      restaurantId: result.user.restaurantId,
    });
  }

  /** Cadastro inicial (usuário + restaurante). Já autentica com os tokens retornados. */
  async signup(input: {
    name: string;
    phone: string;
    email: string;
    password: string;
    restaurantName: string;
    termsAccepted: boolean;
  }): Promise<void> {
    this.remember = true;
    localStorage.setItem(REMEMBER_KEY, '1');
    const response = await this.authClient.signup(
      {
        person: { name: input.name, phone: input.phone },
        email: input.email,
        password: input.password,
        restaurantName: input.restaurantName,
        termsAccepted: input.termsAccepted,
      },
      this.headers,
    );
    const result = response.payload;
    if (!result) throw new Error('Resposta de cadastro sem payload.');
    this.persistTokens(result.accessToken, result.refreshToken, {
      nome: result.user.person.name,
      email: result.user.email,
      empresa: result.restaurant.name,
      restaurantId: result.user.restaurantId,
    });
  }

  /** Dispara o e-mail de recuperação. Resposta é sempre genérica (não revela se o e-mail existe). */
  async forgotPassword(email: string): Promise<string> {
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
    const response = await this.authClient.resetPassword(
      { token, newPassword, confirmNewPassword },
      this.headers,
    );
    return response.payload?.message ?? 'Senha redefinida com sucesso.';
  }

  async refresh(): Promise<boolean> {
    const rt = this._refreshToken();
    if (!rt) return false;
    try {
      const response = await this.authClient.refresh(rt, this.headers);
      const result = response.payload;
      if (!result) throw new Error('Resposta de refresh sem payload.');
      this._accessToken.set(result.accessToken);
      this.write(KEYS.access, result.accessToken);
      if (result.refreshToken) {
        this._refreshToken.set(result.refreshToken);
        this.write(KEYS.refresh, result.refreshToken);
      }
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  async logout(): Promise<void> {
    const rt = this._refreshToken();
    const at = this._accessToken();
    if (rt && at) {
      try {
        await this.authClient.logout(rt, { ...this.headers, authorization: `Bearer ${at}` });
      } catch {
        /* best effort */
      }
    }
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  private persistTokens(accessToken: string, refreshToken: string | null, user: AuthUser): void {
    this._accessToken.set(accessToken);
    this._refreshToken.set(refreshToken);
    const avatarDataUrl = this.getAvatar(user.email) ?? undefined;
    const fullUser: AuthUser = avatarDataUrl ? { ...user, avatarDataUrl } : user;
    this._user.set(fullUser);
    this.write(KEYS.access, accessToken);
    if (refreshToken) this.write(KEYS.refresh, refreshToken);
    this.write(KEYS.user, JSON.stringify(fullUser));
  }

  /**
   * TODO(débito técnico) — avatar de perfil:
   * Não existe suporte a foto de perfil no back nem na modelagem (Person, no Mongo) ainda. Falta:
   *   1) Campo pra guardar a imagem no Person (Mongo aceita base64 direto no documento pra
   *      imagens pequenas — o front já limita a 1MB — ou um bucket/GridFS se preferir separar
   *      do documento principal);
   *   2) Endpoint de upload (recebe a imagem no cadastro e, futuramente, em outras telas);
   *   3) Endpoint pra buscar a imagem do usuário pelo username/e-mail (algo como
   *      GET /pessoas/:username/avatar);
   *   4) A resposta de LOGIN passar a devolver essa imagem junto — hoje `AuthUser` não recebe
   *      nada do servidor pra isso, e sem isso o front precisaria de uma chamada extra só
   *      pra popular o ícone.
   * Por ora: o front captura, valida (≤1MB, tipo imagem) e guarda em cache local por e-mail —
   * só pra provar o fluxo de ponta a ponta. Troca este método por uma chamada real de upload
   * (item 2) assim que o endpoint existir, e `getAvatar` por uma leitura do servidor (item 3).
   */
  saveAvatar(email: string, dataUrl: string): void {
    const key = AVATAR_KEY_PREFIX + email.trim().toLowerCase();
    try {
      localStorage.setItem(key, dataUrl);
    } catch {
      // Cache best-effort (ex.: localStorage cheio) — não deve travar o cadastro por isso.
    }
    this._user.update((u) => (u && u.email === email ? { ...u, avatarDataUrl: dataUrl } : u));
  }

  private getAvatar(email: string): string | null {
    try {
      return localStorage.getItem(AVATAR_KEY_PREFIX + email.trim().toLowerCase());
    } catch {
      return null;
    }
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    this.remove(KEYS.access);
    this.remove(KEYS.refresh);
    this.remove(KEYS.user);
  }

  private loadStoredUser(): AuthUser | null {
    const raw = this.read(KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
