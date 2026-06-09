import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  nome: string;
  email: string;
  cpf: string;
  empresa?: string;
}

const REMEMBER_KEY = 'mintly-remember';
const KEYS = {
  access: 'mintly-access-token',
  refresh: 'mintly-refresh-token',
  user: 'mintly-user',
} as const;

interface LoginResponse {
  accessToken: string;
  refreshToken: string | null;
  user: AuthUser;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly API = environment.apiUrl;

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

  getAccessToken(): string | null {
    return this._accessToken();
  }

  async login(email: string, password: string, remember = true): Promise<void> {
    this.remember = remember;
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.API}/auth/login`, { email, password }),
    );
    this.persistTokens(response);
  }

  async refresh(): Promise<boolean> {
    const rt = this._refreshToken();
    if (!rt) return false;
    try {
      const response = await firstValueFrom(
        this.http.post<RefreshResponse>(`${this.API}/auth/refresh`, { refreshToken: rt }),
      );
      this._accessToken.set(response.accessToken);
      this.write(KEYS.access, response.accessToken);
      if (response.refreshToken) {
        this._refreshToken.set(response.refreshToken);
        this.write(KEYS.refresh, response.refreshToken);
      }
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  async logout(): Promise<void> {
    const rt = this._refreshToken();
    if (rt) {
      try {
        await firstValueFrom(this.http.post(`${this.API}/auth/logout`, { refreshToken: rt }));
      } catch {
        /* best effort */
      }
    }
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  private persistTokens(data: LoginResponse): void {
    this._accessToken.set(data.accessToken);
    this._refreshToken.set(data.refreshToken);
    this._user.set(data.user);
    this.write(KEYS.access, data.accessToken);
    if (data.refreshToken) this.write(KEYS.refresh, data.refreshToken);
    this.write(KEYS.user, JSON.stringify(data.user));
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
