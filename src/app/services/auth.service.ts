import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  nome: string;
  email: string;
  cpf: string;
}

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
  private readonly API = environment.apiUrl;

  private _accessToken = signal<string | null>(localStorage.getItem('mintly-access-token'));
  private _refreshToken = signal<string | null>(localStorage.getItem('mintly-refresh-token'));
  private _user = signal<AuthUser | null>(this.loadStoredUser());

  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly currentUser = this._user.asReadonly();

  constructor(private http: HttpClient, private router: Router) {}

  getAccessToken(): string | null {
    return this._accessToken();
  }

  async login(email: string, password: string): Promise<void> {
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
      localStorage.setItem('mintly-access-token', response.accessToken);
      if (response.refreshToken) {
        this._refreshToken.set(response.refreshToken);
        localStorage.setItem('mintly-refresh-token', response.refreshToken);
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
      } catch { /* best effort */ }
    }
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  private persistTokens(data: LoginResponse): void {
    this._accessToken.set(data.accessToken);
    this._refreshToken.set(data.refreshToken);
    this._user.set(data.user);
    localStorage.setItem('mintly-access-token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('mintly-refresh-token', data.refreshToken);
    localStorage.setItem('mintly-user', JSON.stringify(data.user));
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    localStorage.removeItem('mintly-access-token');
    localStorage.removeItem('mintly-refresh-token');
    localStorage.removeItem('mintly-user');
  }

  private loadStoredUser(): AuthUser | null {
    const raw = localStorage.getItem('mintly-user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
}
