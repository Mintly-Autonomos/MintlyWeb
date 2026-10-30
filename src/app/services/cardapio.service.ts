import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { apiErrorMessage } from '../shared/api-error-message';
import { MintlyClientService } from './mintly-client.service';
import mockCardapio from '../mocks/mock_cardapio.json';
import { Prato, PratoAlerta, diasSemRevisao, precisaRevisar, toPrato } from './cardapio.builder';

export type { Prato, PratoAlerta } from './cardapio.builder';

const DAY_MS = 86_400_000;

function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cardápio (pratos com preço). Serve a aba "Meu cardápio" de Previsões e os avisos de revisão de
 * preço (sino). O servidor decide quem precisa de revisão (`priceAlerts`): 167+ dias sem mudar o
 * valor nem dizer que quer manter.
 */
@Injectable({ providedIn: 'root' })
export class CardapioService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private menuClient = inject(MintlyClientService).client.menuItemClient;

  /** Seed do modo mock (`environment.useMocks: true`, só local) — sem efeito quando false. */
  private mockStore: Prato[] = (
    mockCardapio as {
      id: string;
      name: string;
      category: string;
      price: number;
      cost: number;
      soldPerMonth: number;
      diasSemRevisar: number;
    }[]
  ).map((m) => {
    const when = new Date(Date.now() - m.diasSemRevisar * DAY_MS).toISOString();
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      price: m.price,
      cost: m.cost,
      soldPerMonth: m.soldPerMonth,
      active: true,
      priceUpdatedAt: when,
      priceReviewedAt: when,
    };
  });

  readonly pratos = signal<Prato[]>([]);
  readonly alertas = signal<PratoAlerta[]>([]);
  readonly loading = signal(false);
  readonly categorias = computed(() =>
    [
      ...new Set(
        this.pratos()
          .map((p) => p.category)
          .filter((c): c is string => !!c),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  );

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Executa uma chamada autenticada; em 401 tenta 1x refresh + retry antes de desistir. */
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
    return apiErrorInfo(err).status === 401;
  }

  /** Texto de erro da API quando há (ex.: "Já existe um prato com este nome"). */
  errorMessage(err: unknown, fallback = 'Não foi possível concluir a operação. Tente novamente.') {
    return apiErrorMessage(err, fallback);
  }

  /** Lista de pratos + avisos, juntos (os avisos mudam sempre que um preço é revisado). */
  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([this.refreshPratos(), this.refreshAlertas()]);
    } finally {
      this.loading.set(false);
    }
  }

  async refreshPratos(): Promise<void> {
    if (environment.useMocks) {
      await delay();
      this.pratos.set(this.mockStore.map((p) => ({ ...p })));
      return;
    }
    const response = await this.call((headers) =>
      this.menuClient.findAll({ page: 1, size: 100 }, headers),
    );
    this.pratos.set((response.payload ?? []).map(toPrato));
  }

  /** Só os avisos (usado pelo sino, que não precisa da lista inteira). */
  async refreshAlertas(): Promise<void> {
    if (environment.useMocks) {
      const now = new Date();
      this.alertas.set(
        this.mockStore
          .filter((p) => precisaRevisar(p, now))
          .sort((a, b) => a.priceReviewedAt.localeCompare(b.priceReviewedAt))
          .map((p) => ({ ...p, daysSinceReview: diasSemRevisao(p, now) })),
      );
      return;
    }
    const response = await this.call((headers) => this.menuClient.priceAlerts(headers));
    this.alertas.set(
      (response.payload ?? []).map((a) => ({ ...toPrato(a), daysSinceReview: a.daysSinceReview })),
    );
  }

  async create(input: {
    name: string;
    price: number;
    category?: string;
    cost?: number;
    soldPerMonth?: number;
  }): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const now = new Date().toISOString();
      this.mockStore.push({
        id: `prato-${Date.now()}`,
        name: input.name,
        category: input.category || null,
        price: input.price,
        cost: input.cost ?? 0,
        soldPerMonth: input.soldPerMonth ?? 0,
        active: true,
        priceUpdatedAt: now,
        priceReviewedAt: now,
      });
    } else {
      await this.call((headers) =>
        this.menuClient.insert(
          {
            name: input.name,
            price: input.price,
            ...(input.category ? { category: input.category } : {}),
            ...(input.cost !== undefined ? { cost: input.cost } : {}),
            ...(input.soldPerMonth !== undefined ? { soldPerMonth: input.soldPerMonth } : {}),
          },
          headers,
        ),
      );
    }
    await this.refresh();
  }

  /** Nome e categoria. O preço tem ação própria (muda o valor e conta como revisão). */
  /** Nome, categoria, custo e vendidos no mês. O preço tem ação própria (`changePrice`). */
  async update(
    id: string,
    input: { name?: string; category?: string; cost?: number; soldPerMonth?: number },
  ): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const p = this.mockStore.find((x) => x.id === id);
      if (p) {
        if (input.name !== undefined) p.name = input.name;
        if (input.category !== undefined) p.category = input.category || null;
        if (input.cost !== undefined) p.cost = input.cost;
        if (input.soldPerMonth !== undefined) p.soldPerMonth = input.soldPerMonth;
      }
    } else {
      await this.call((headers) => this.menuClient.update(id, input, headers));
    }
    await this.refreshPratos();
  }

  /** Muda o preço: atualiza o valor e conta como revisão (o aviso some). */
  async changePrice(id: string, price: number): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const p = this.mockStore.find((x) => x.id === id);
      if (p) {
        const now = new Date().toISOString();
        if (p.price !== price) {
          p.price = price;
          p.priceUpdatedAt = now;
        }
        p.priceReviewedAt = now;
      }
    } else {
      await this.call((headers) => this.menuClient.updatePrice(id, price, headers));
    }
    await this.refresh();
  }

  /** "Não quero mudar": mantém o valor e conta como revisão (o aviso some). */
  async keepPrice(id: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const p = this.mockStore.find((x) => x.id === id);
      if (p) p.priceReviewedAt = new Date().toISOString();
    } else {
      await this.call((headers) => this.menuClient.keepPrice(id, headers));
    }
    await this.refresh();
  }

  async setActive(id: string, active: boolean): Promise<void> {
    if (environment.useMocks) {
      await delay();
      const p = this.mockStore.find((x) => x.id === id);
      if (p) p.active = active;
    } else {
      await this.call((headers) =>
        active
          ? this.menuClient.reactivateUpdate(id, headers)
          : this.menuClient.inactivateUpdate(id, headers),
      );
    }
    await this.refresh();
  }
}
