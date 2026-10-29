import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { AlertComponent } from '../../shared/alert.component';
import { IconComponent } from '../../shared/icon.component';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService } from '../../services/subscription.service';
import { fmtEndsAt } from './assinatura.format';

/** A cada quantos ms consultar e por quantas vezes (~2 min): Pix e cartão confirmam em segundos. */
export const POLL_INTERVAL_MS = 3000;
export const POLL_MAX_TRIES = 40;

export type RetornoStatus = 'confirming' | 'paid' | 'refused' | 'waiting';

/** Resultado que o Mercado Pago informa na volta (`status`/`collection_status`) — só orienta a mensagem, nunca libera nada. */
export function refusedByProvider(params: { get(name: string): string | null }): boolean {
  const reported = params.get('collection_status') ?? params.get('status');
  return reported === 'rejected' || reported === 'failure' || reported === 'cancelled';
}

/**
 * Volta do pagamento. Voltar do checkout NÃO prova que pagou: quem confirma é o aviso do provedor à API.
 * Esta tela só consulta o estado da assinatura até ela ficar ativa com a nova data, e então segue
 * (onboarding para quem acabou de se cadastrar, app para os demais).
 */
@Component({
  selector: 'app-assinatura-retorno',
  standalone: true,
  imports: [AuthCardComponent, AlertComponent, IconComponent],
  template: `
    <app-auth-card [wide]="true" [title]="title()" [subtitle]="subtitle()">
      <div class="flex items-center justify-center mb-4">
        @switch (status()) {
          @case ('paid') {
            <div class="h-16 w-16 rounded-2xl bg-mint-soft grid place-items-center text-success">
              <app-icon name="check_circle" [style]="{ fontSize: '34px' }" />
            </div>
          }
          @case ('refused') {
            <div class="h-16 w-16 rounded-2xl bg-error/10 grid place-items-center text-error">
              <app-icon name="error" [style]="{ fontSize: '34px' }" />
            </div>
          }
          @default {
            <div class="h-16 w-16 rounded-2xl bg-mint-soft grid place-items-center text-ocean">
              <app-icon name="hourglass_top" [style]="{ fontSize: '34px' }" />
            </div>
          }
        }
      </div>

      @switch (status()) {
        @case ('paid') {
          <button
            type="button"
            (click)="continuar()"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 cursor-pointer"
          >
            Continuar
          </button>
        }
        @case ('refused') {
          <app-alert variant="error" title="O pagamento não foi aprovado">
            Nada foi cobrado. Você pode tentar de novo com o mesmo plano ou com outra forma de
            pagamento.
          </app-alert>
          <button
            type="button"
            (click)="router.navigate(['/assinatura'])"
            class="mt-4 w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 cursor-pointer"
          >
            Tentar de novo
          </button>
        }
        @case ('waiting') {
          <app-alert variant="info" title="Ainda estamos aguardando a confirmação">
            Pix e boleto podem levar alguns minutos. Assim que o pagamento for aprovado, o acesso é
            liberado automaticamente: pode fechar esta tela e voltar mais tarde.
          </app-alert>
          <div class="space-y-3 mt-4">
            <button
              type="button"
              (click)="verificar()"
              class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 cursor-pointer"
            >
              Verificar de novo
            </button>
            <button
              type="button"
              (click)="router.navigate(['/assinatura'])"
              class="w-full h-12 rounded-xl border border-border bg-card font-medium text-sm hover:bg-muted cursor-pointer"
            >
              Voltar para a assinatura
            </button>
          </div>
        }
      }
    </app-auth-card>
  `,
})
export class AssinaturaRetornoComponent implements OnInit {
  protected router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private subscription = inject(SubscriptionService);
  private destroyRef = inject(DestroyRef);

  protected status = signal<RetornoStatus>('confirming');
  private tries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected title = computed(() => {
    switch (this.status()) {
      case 'paid':
        return 'Pagamento aprovado!';
      case 'refused':
        return 'Pagamento não aprovado';
      case 'waiting':
        return 'Aguardando a confirmação';
      default:
        return 'Confirmando seu pagamento';
    }
  });

  protected subtitle = computed(() => {
    const ends = fmtEndsAt(this.auth.subscriptionState().endsAt);
    switch (this.status()) {
      case 'paid':
        return `Sua assinatura está ativa até ${ends}.`;
      case 'refused':
        return 'O provedor de pagamento não aprovou a cobrança.';
      case 'waiting':
        return 'Ainda não recebemos a aprovação do pagamento.';
      default:
        return 'Isso leva só alguns segundos. Não feche esta tela.';
    }
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stop());
    if (refusedByProvider(this.route.snapshot.queryParamMap)) {
      this.status.set('refused');
      return;
    }
    void this.poll();
  }

  verificar(): void {
    this.tries = 0;
    this.status.set('confirming');
    void this.poll();
  }

  continuar(): void {
    this.subscription.clearBaseline();
    void this.router.navigateByUrl(this.auth.consumeNextRouteAfterSubscription());
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    this.stop();
    this.tries++;
    try {
      const overview = await this.subscription.refresh();
      if (overview && this.subscription.isPaid(overview)) {
        this.status.set('paid');
        return;
      }
    } catch {
      /* falha de rede: tenta de novo no próximo ciclo */
    }
    if (this.tries >= POLL_MAX_TRIES) {
      this.status.set('waiting');
      return;
    }
    this.timer = setTimeout(() => void this.poll(), POLL_INTERVAL_MS);
  }
}
