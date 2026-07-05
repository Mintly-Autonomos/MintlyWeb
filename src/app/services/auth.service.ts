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
}

const REMEMBER_KEY = 'mintly-remember';
const KEYS = {
  access: 'mintly-access-token',
  refresh: 'mintly-refresh-token',
  user: 'mintly-user',
} as const;

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
    this._user.set(user);
    this.write(KEYS.access, accessToken);
    if (refreshToken) this.write(KEYS.refresh, refreshToken);
    this.write(KEYS.user, JSON.stringify(user));
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
