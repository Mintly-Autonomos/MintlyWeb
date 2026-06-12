import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// Formato que a API devolve (envelope ResponseBuilder)
interface ApiResponse<T> { payload: T }

// Sub-documento person retornado pelo API
interface PersonRef { _id?: string; name: string }

/** Visão pública do usuário que persiste em storage */
export interface AuthUser {
  name: string;       // user.person.name
  email: string;
  role: string;
  restaurantId: string;
}

interface RawAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  user: {
    person: PersonRef;
    email: string;
    role: string;
    restaurantId: string;
    [key: string]: unknown;
  };
}

interface RawRefreshTokens {
  accessToken: string;
  refreshToken: string | null;
}

const REMEMBER_KEY = 'mintly-remember';
const KEYS = {
  access: 'mintly-access-token',
  refresh: 'mintly-refresh-token',
  user: 'mintly-user',
} as const;

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

  private get store(): Storage {
    return this.remember ? localStorage : sessionStorage;
  }
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

  // POST /auth/login
  async login(email: string, password: string, remember = true): Promise<void> {
    this.remember = remember;
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    const res = await firstValueFrom(
      this.http.post<ApiResponse<RawAuthTokens>>(`${this.API}/auth/login`, { email, password }),
    );
    this.persistSession(res.payload);
  }

  // POST /auth/signup
  async signup(data: {
    name: string;
    phone: string;
    email: string;
    password: string;
    restaurantName: string;
    termsAccepted: boolean;
  }): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<RawAuthTokens>>(`${this.API}/auth/signup`, {
        person: { name: data.name, phone: data.phone },
        email: data.email,
        password: data.password,
        restaurantName: data.restaurantName,
        termsAccepted: data.termsAccepted,
      }),
    );
    this.persistSession(res.payload);
  }

  // POST /auth/refresh — retorna true se conseguiu renovar
  async refresh(): Promise<boolean> {
    const rt = this._refreshToken();
    if (!rt) return false;
    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<RawRefreshTokens>>(`${this.API}/auth/refresh`, { refreshToken: rt }),
      );
      this._accessToken.set(res.payload.accessToken);
      this.write(KEYS.access, res.payload.accessToken);
      if (res.payload.refreshToken) {
        this._refreshToken.set(res.payload.refreshToken);
        this.write(KEYS.refresh, res.payload.refreshToken);
      }
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  // POST /auth/logout
  async logout(): Promise<void> {
    const rt = this._refreshToken();
    if (rt) {
      try {
        await firstValueFrom(this.http.post(`${this.API}/auth/logout`, { refreshToken: rt }));
      } catch { /* best effort */ }
    }
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  // POST /auth/forgot-password — envia e-mail de recuperação
  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.API}/auth/forgot-password`, { email }),
    );
  }

  // POST /auth/reset-password — redefine senha com o token do e-mail
  async resetPassword(token: string, newPassword: string, confirmNewPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.API}/auth/reset-password`, { token, newPassword, confirmNewPassword }),
    );
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    this.remove(KEYS.access);
    this.remove(KEYS.refresh);
    this.remove(KEYS.user);
  }

  private persistSession(raw: RawAuthTokens): void {
    const user: AuthUser = {
      name: raw.user.person?.name ?? raw.user.email,
      email: raw.user.email,
      role: raw.user.role,
      restaurantId: raw.user.restaurantId,
    };
    this._accessToken.set(raw.accessToken);
    this._refreshToken.set(raw.refreshToken);
    this._user.set(user);
    this.write(KEYS.access, raw.accessToken);
    if (raw.refreshToken) this.write(KEYS.refresh, raw.refreshToken);
    this.write(KEYS.user, JSON.stringify(user));
  }

  private loadStoredUser(): AuthUser | null {
    const raw = this.read(KEYS.user);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
}
