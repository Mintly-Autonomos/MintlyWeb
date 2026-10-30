import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  applySubscriptionPurchase,
  computeSubscriptionState,
  isSubscriptionPlan,
  isSubscriptionTier,
  subscriptionPlanPrice,
  subscriptionTiers,
} from 'mintly-lib';
import type {
  Headers,
  SubscriptionCheckoutResponse,
  SubscriptionOverview,
  SubscriptionPlanMonths,
  SubscriptionTier,
} from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';
import { apiErrorInfo } from '../shared/api-error';

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BASELINE_KEY = 'mintly-checkout-baseline';

const is404 = (err: unknown): boolean => apiErrorInfo(err).status === 404;

/**
 * Assinatura: estado, escolha do plano e pagamento. O estado em si (data limite) mora no AuthService,
 * porque vem no login/cadastro e o guard precisa dele; aqui ficam as chamadas à API
 * (`GET /subscription`, `POST /subscription/checkout`, simulador) e o modo mock.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private client = inject(MintlyClientService).client.subscriptionClient;

  /** Última resposta de GET /subscription (tipos com planos, preços e provedor para montar a tela). */
  readonly overview = signal<SubscriptionOverview | null>(null);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Em 401 renova o token e tenta de novo, como os demais serviços. */
  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (apiErrorInfo(err).status === 401) {
        if (await this.auth.refresh()) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  /**
   * Busca o estado na API e atualiza a data limite guardada. Devolve `null` quando a API não conhece
   * a assinatura (404): sem o recurso não há portão, e o app não pode prender ninguém na tela de pagamento.
   */
  async refresh(): Promise<SubscriptionOverview | null> {
    if (environment.useMocks) {
      await delay(150);
      const current = this.auth.subscriptionState();
      const overview: SubscriptionOverview = {
        ...computeSubscriptionState(current.endsAt, new Date(), current.tier),
        tiers: subscriptionTiers(),
        provider: 'mock',
      };
      this.overview.set(overview);
      return overview;
    }
    try {
      const response = await this.call((headers) => this.client.overview(headers));
      const overview = response.payload ?? null;
      if (overview) {
        this.overview.set(overview);
        this.auth.setSubscriptionEndsAt(overview.endsAt, overview.tier);
      }
      return overview;
    } catch (err) {
      if (is404(err)) return null;
      throw err;
    }
  }

  /**
   * Antes de ir pagar, lembra a data limite de agora. Na volta, "pago" é a assinatura estar ativa com uma
   * data DIFERENTE da de antes: sem isso, quem renova com a assinatura ainda ativa veria "aprovado" na hora,
   * antes do pagamento ser confirmado.
   */
  private rememberBaseline(): void {
    try {
      sessionStorage.setItem(BASELINE_KEY, this.auth.subscriptionState().endsAt ?? '');
    } catch {
      /* sem storage: na volta vale só "estar ativa" */
    }
  }

  /** O pagamento feito no checkout já foi confirmado? (ver rememberBaseline) */
  isPaid(overview: { status: string; endsAt: string | null }): boolean {
    if (overview.status !== 'active') return false;
    let baseline: string | null = null;
    try {
      baseline = sessionStorage.getItem(BASELINE_KEY);
    } catch {
      /* sem storage */
    }
    if (baseline === null) return true;
    return overview.endsAt !== (baseline || null);
  }

  clearBaseline(): void {
    try {
      sessionStorage.removeItem(BASELINE_KEY);
    } catch {
      /* sem storage */
    }
  }

  /** Cria a cobrança do plano. Devolve para onde levar a pessoa pagar. */
  async checkout(
    months: SubscriptionPlanMonths,
    tier: SubscriptionTier = 'basic',
  ): Promise<SubscriptionCheckoutResponse> {
    if (!isSubscriptionPlan(months)) throw new Error('Plano inválido.');
    if (!isSubscriptionTier(tier)) throw new Error('Tipo de assinatura inválido.');
    if (environment.useMocks) {
      await delay();
      this.rememberBaseline();
      const paymentId = `mock-${tier}-${months}-${Date.now()}`;
      return {
        paymentId,
        checkoutUrl: `/assinatura/simulador?pagamento=${paymentId}`,
        provider: 'mock',
        tier,
        months,
        totalCents: subscriptionPlanPrice(months, tier).totalCents,
      };
    }
    const response = await this.call((headers) => this.client.checkout({ months, tier }, headers));
    if (!response.payload) throw new Error('Resposta de pagamento sem dados.');
    this.rememberBaseline();
    return response.payload;
  }

  /** Só no ambiente de teste: aprova ou recusa o pagamento simulado. */
  async mockDecide(paymentId: string, decision: 'approved' | 'rejected'): Promise<void> {
    if (environment.useMocks) {
      await delay();
      if (decision === 'approved') {
        const match = /^mock-(basic|pro)-(\d+)-/.exec(paymentId);
        const tier = match?.[1];
        const months = Number(match?.[2]);
        if (isSubscriptionTier(tier) && isSubscriptionPlan(months)) {
          const current = this.auth.subscriptionState();
          // Mesma regra da API: mesmo tipo soma ao que sobrou; tipo diferente conta de hoje.
          const purchase = applySubscriptionPurchase(
            { endsAt: current.endsAt ? new Date(current.endsAt) : null, tier: current.tier },
            { tier, months },
          );
          this.auth.setSubscriptionEndsAt(purchase.endsAt.toISOString(), purchase.tier);
        }
      }
      return;
    }
    await this.call((headers) => this.client.mockDecide({ paymentId, decision }, headers));
    await this.refresh();
  }
}
