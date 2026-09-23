import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type NotificationType = 'preco-parado';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  itemName: string;
  monthsUnchanged: number;
  read: boolean;
  createdAt: string;
  actionLabel: string;
  actionRoute: string;
  actionQueryParams?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly notifications = signal<AppNotification[]>([]);
  readonly loading = signal(false);
  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Mesmo wrapper autenticado dos outros services (401 -> refresh + retry) — pronto pra quando o endpoint existir. */
  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (this.isUnauthorized(err)) {
        const refreshed = await this.auth.refresh();
        if (refreshed) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { response?: { status?: number } }).response?.status === 401
    );
  }

  /**
   * TODO(API): não existe endpoint de notificações na mintly-lib ainda. O desenho real é o
   * servidor varrer os itens do cardápio e apontar os que estão com o mesmo preço há 4+ meses
   * (entre outras regras que podem entrar depois) — devolvendo algo no formato abaixo. Por ora
   * é um mock local; troca só o corpo de `fetch` quando o endpoint existir.
   */
  private async fetch(): Promise<{ payload: AppNotification[] }> {
    await new Promise((r) => setTimeout(r, 300));
    return {
      payload: [
        {
          id: 'preco-bingsu',
          type: 'preco-parado',
          title: 'Bingsu de morango sem reajuste há 5 meses',
          description:
            'O preço está parado em R$ 32,00 desde então. Vale revisar se ainda cobre o custo atual dos ingredientes.',
          itemName: 'Bingsu de morango',
          monthsUnchanged: 5,
          read: false,
          createdAt: new Date().toISOString(),
          actionLabel: 'Rever preço',
          actionRoute: '/previsoes',
          actionQueryParams: { tab: 'cardapio', item: 'Bingsu de morango' },
        },
        {
          id: 'preco-cheese-powder',
          type: 'preco-parado',
          title: 'Frango Cheese Powder sem reajuste há 4 meses',
          description:
            'O preço está parado em R$ 68,00 desde então. Vale revisar se ainda cobre o custo atual dos ingredientes.',
          itemName: 'Frango Cheese Powder',
          monthsUnchanged: 4,
          read: false,
          createdAt: new Date().toISOString(),
          actionLabel: 'Rever preço',
          actionRoute: '/previsoes',
          actionQueryParams: { tab: 'cardapio', item: 'Frango Cheese Powder' },
        },
      ],
    };
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.call(() => this.fetch());
      this.notifications.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }

  /** Só marca localmente por ora — quando o endpoint existir, persiste a leitura no servidor aqui também. */
  markAsRead(id: string): void {
    this.notifications.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  markAllAsRead(): void {
    this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
  }
}
