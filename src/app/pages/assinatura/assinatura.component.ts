import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { subscriptionTiers } from 'mintly-lib';
import type {
  SubscriptionPlanMonths,
  SubscriptionPlanOption,
  SubscriptionTier,
  SubscriptionTierOption,
} from 'mintly-lib';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { AlertComponent } from '../../shared/alert.component';
import { IconComponent } from '../../shared/icon.component';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService } from '../../services/subscription.service';
import { apiErrorInfo } from '../../shared/api-error';
import {
  formatCents,
  planLabel,
  planPerMonthLabel,
  planSavingCents,
  subscriptionHeadline,
  tierBlurb,
  tierChangeNotice,
  tierLabel,
} from './assinatura.format';

/** Plano que já vem marcado: o do meio, sem empurrar ninguém para o mais caro nem para o mais barato. */
const DEFAULT_PLAN: SubscriptionPlanMonths = 3;

/**
 * Tela de assinatura: aparece logo depois do cadastro, no login sem assinatura válida, quando ela
 * vence e quando a pessoa quer renovar. Escolhe o período, cria a cobrança e leva ao pagamento.
 */
@Component({
  selector: 'app-assinatura',
  standalone: true,
  imports: [AuthCardComponent, AlertComponent, IconComponent],
  template: `
    <app-auth-card [wide]="true" [title]="headline().title" [subtitle]="headline().subtitle">
      @if (provider() === 'mock') {
        <div class="mb-4">
          <app-alert variant="warning" title="Ambiente de teste">
            Nenhum pagamento de verdade será cobrado: você aprova ou recusa o pagamento numa tela de
            simulação.
          </app-alert>
        </div>
      }

      @if (loadError()) {
        <div class="mb-4">
          <app-alert variant="error" title="Não foi possível carregar os planos">
            {{ loadError() }}
          </app-alert>
        </div>
        <button
          type="button"
          (click)="load()"
          class="w-full h-12 rounded-xl border border-border bg-card font-medium text-sm hover:bg-muted cursor-pointer"
        >
          Tentar de novo
        </button>
      } @else {
        <div
          role="radiogroup"
          aria-label="Tipo de assinatura"
          class="grid grid-cols-2 gap-2.5 mb-4"
        >
          @for (t of tiers(); track t.tier) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="selectedTier() === t.tier"
              (click)="selectedTier.set(t.tier)"
              [class]="
                'text-left rounded-2xl border p-3.5 transition cursor-pointer ' +
                (selectedTier() === t.tier
                  ? 'border-mint bg-mint-soft'
                  : 'border-border bg-card hover:bg-muted')
              "
            >
              <span class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-[15px]">{{ t.label }}</span>
                @if (state().status === 'active' && state().tier === t.tier) {
                  <span
                    class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ocean/10 text-ocean"
                  >
                    Seu plano
                  </span>
                }
              </span>
              <span class="block text-[13px] font-semibold tabular-nums mt-0.5"
                >{{ cents(t.monthlyCents) }} por mês</span
              >
              <span class="block text-[12px] text-muted-foreground mt-1 leading-snug">{{
                blurb(t.tier)
              }}</span>
            </button>
          }
        </div>

        @if (tierChange(); as change) {
          <div class="mb-4">
            <app-alert variant="warning" [title]="change.title">
              {{ change.description }}
            </app-alert>
          </div>
        }

        <div role="radiogroup" aria-label="Período da assinatura" class="space-y-2.5">
          @for (p of plans(); track p.months) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="selected() === p.months"
              (click)="selected.set(p.months)"
              [class]="
                'w-full text-left rounded-2xl border p-4 flex items-center gap-3 transition cursor-pointer ' +
                (selected() === p.months
                  ? 'border-mint bg-mint-soft'
                  : 'border-border bg-card hover:bg-muted')
              "
            >
              <span
                [class]="
                  'h-5 w-5 rounded-full border-2 grid place-items-center shrink-0 ' +
                  (selected() === p.months ? 'border-mint' : 'border-border')
                "
              >
                @if (selected() === p.months) {
                  <span class="h-2.5 w-2.5 rounded-full bg-mint"></span>
                }
              </span>
              <span class="flex-1 min-w-0">
                <span class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-[15px]">{{ label(p.months) }}</span>
                  @if (p.discountPercent > 0) {
                    <span
                      class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success"
                    >
                      {{ p.discountPercent }}% de desconto
                    </span>
                  }
                </span>
                <span class="block text-[12.5px] text-muted-foreground mt-0.5">
                  {{ perMonth(p) }}
                  @if (saving(p) > 0) {
                    · você economiza {{ cents(saving(p)) }}
                  }
                </span>
              </span>
              <span class="font-bold text-[16px] tabular-nums shrink-0">{{
                cents(p.totalCents)
              }}</span>
            </button>
          }
        </div>

        @if (error()) {
          <div class="mt-4">
            <app-alert variant="error" title="Não foi possível iniciar o pagamento">
              {{ error() }}
            </app-alert>
          </div>
        }

        <button
          type="button"
          (click)="pay()"
          [disabled]="busy() || !selectedPlan()"
          class="mt-5 w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="lock" [style]="{ fontSize: '20px' }" />
          <span>{{ busy() ? 'Abrindo o pagamento…' : payLabel() }}</span>
        </button>

        <p class="text-[12px] text-muted-foreground text-center mt-3 leading-relaxed">
          @if (provider() === 'mercadopago') {
            Você será levado ao ambiente seguro do Mercado Pago (cartão, Pix ou boleto) para
            concluir.
          }
          O acesso é liberado assim que o pagamento é aprovado.
        </p>
      }

      <div class="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
        @if (state().status === 'active') {
          <button
            type="button"
            (click)="router.navigate(['/'])"
            class="text-[13px] font-medium text-ocean hover:underline py-2 -my-2 cursor-pointer"
          >
            Voltar para o app
          </button>
        } @else {
          <span></span>
        }
        <button
          type="button"
          (click)="logout()"
          class="text-[13px] font-medium text-muted-foreground hover:underline py-2 -my-2 cursor-pointer"
        >
          Sair da conta
        </button>
      </div>
    </app-auth-card>
  `,
})
export class AssinaturaComponent implements OnInit {
  protected router = inject(Router);
  private auth = inject(AuthService);
  private subscription = inject(SubscriptionService);

  protected selected = signal<SubscriptionPlanMonths>(DEFAULT_PLAN);
  /** Tipo escolhido: começa no que a pessoa já tem (renovar) ou no Básico. Segue o estado assim que ele chega. */
  protected selectedTier = signal<SubscriptionTier>(this.auth.subscriptionState().tier ?? 'basic');
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected loadError = signal<string | null>(null);

  /** Tipos (com seus planos) da API; antes dela responder, os da própria lib (mesma tabela de preços). */
  protected tiers = computed<SubscriptionTierOption[]>(
    () => this.subscription.overview()?.tiers ?? subscriptionTiers(),
  );
  protected plans = computed<SubscriptionPlanOption[]>(
    () => this.tiers().find((t) => t.tier === this.selectedTier())?.plans ?? [],
  );
  protected tierChange = computed(() => tierChangeNotice(this.state(), this.selectedTier()));
  protected provider = computed(() => this.subscription.overview()?.provider ?? null);
  protected state = computed(() => {
    // O estado vem da API quando há; senão do que está guardado (calculado na hora).
    const o = this.subscription.overview();
    return o ?? this.auth.subscriptionState();
  });
  protected headline = computed(() => subscriptionHeadline(this.state()));
  protected selectedPlan = computed(() => this.plans().find((p) => p.months === this.selected()));
  protected payLabel = computed(() => {
    const plan = this.selectedPlan();
    return plan ? `Pagar ${formatCents(plan.totalCents)} · ${tierLabel(plan.tier)}` : 'Pagar';
  });

  protected label = planLabel;
  protected blurb = tierBlurb;
  protected cents = formatCents;
  protected perMonth = planPerMonthLabel;
  protected saving = planSavingCents;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      const overview = await this.subscription.refresh();
      // Quem já tem assinatura abre no tipo dela (renovar é o caso comum).
      if (overview?.tier) this.selectedTier.set(overview.tier);
    } catch {
      this.loadError.set('Verifique sua conexão e tente novamente.');
    }
  }

  async pay(): Promise<void> {
    const plan = this.selectedPlan();
    if (!plan || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const checkout = await this.subscription.checkout(plan.months, plan.tier);
      // Endereço do próprio app (simulador) navega por dentro; o do provedor sai do site.
      if (checkout.checkoutUrl.startsWith('/')) {
        await this.router.navigateByUrl(checkout.checkoutUrl);
      } else {
        window.location.assign(checkout.checkoutUrl);
      }
    } catch (err) {
      const message = apiErrorInfo(err).message;
      this.error.set(message ?? 'Tente novamente em instantes.');
    } finally {
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
