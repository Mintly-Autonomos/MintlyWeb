import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { AlertComponent } from '../../shared/alert.component';
import { IconComponent } from '../../shared/icon.component';
import { SubscriptionService } from '../../services/subscription.service';
import { apiErrorInfo } from '../../shared/api-error';

/**
 * Simulador de pagamento: só existe quando a API roda com o provedor simulado (ambiente de teste).
 * Faz o papel da página do Mercado Pago: a pessoa aprova ou recusa e volta para a mesma tela de retorno
 * que o pagamento de verdade usa. Com o provedor real configurado, esta tela não faz nada.
 */
@Component({
  selector: 'app-assinatura-simulador',
  standalone: true,
  imports: [AuthCardComponent, AlertComponent, IconComponent],
  template: `
    <app-auth-card
      [wide]="true"
      title="Pagamento de teste"
      subtitle="Esta tela simula a página do provedor de pagamento."
    >
      @if (available() === false) {
        <app-alert variant="error" title="Simulador indisponível">
          O simulador só existe no ambiente de teste. Volte e escolha o plano para pagar.
        </app-alert>
        <button
          type="button"
          (click)="router.navigate(['/assinatura'])"
          class="mt-4 w-full h-12 rounded-xl border border-border bg-card font-medium text-sm hover:bg-muted cursor-pointer"
        >
          Voltar para a assinatura
        </button>
      } @else {
        <app-alert variant="warning" title="Nenhum valor será cobrado">
          Você está num ambiente de teste. Escolha o que deve acontecer com este pagamento.
        </app-alert>

        @if (error()) {
          <div class="mt-4">
            <app-alert variant="error" title="Não foi possível concluir">{{ error() }}</app-alert>
          </div>
        }

        <div class="space-y-3 mt-5">
          <button
            type="button"
            (click)="decidir('approved')"
            [disabled]="busy() || !pagamento"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
          >
            <app-icon name="check_circle" [style]="{ fontSize: '20px' }" /><span
              >Aprovar pagamento</span
            >
          </button>
          <button
            type="button"
            (click)="decidir('rejected')"
            [disabled]="busy() || !pagamento"
            class="w-full h-12 rounded-xl border border-border bg-card font-medium text-sm hover:bg-muted disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
          >
            <app-icon name="cancel" [style]="{ fontSize: '20px' }" /><span>Recusar pagamento</span>
          </button>
        </div>
      }
    </app-auth-card>
  `,
})
export class AssinaturaSimuladorComponent implements OnInit {
  protected router = inject(Router);
  private subscription = inject(SubscriptionService);
  protected pagamento = inject(ActivatedRoute).snapshot.queryParamMap.get('pagamento') ?? '';

  protected busy = signal(false);
  protected error = signal<string | null>(null);
  /** `null` até a API responder; `false` quando o provedor não é o simulado. */
  protected available = signal<boolean | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const overview = await this.subscription.refresh();
      this.available.set(overview?.provider === 'mock');
    } catch {
      this.available.set(false);
    }
  }

  async decidir(decision: 'approved' | 'rejected'): Promise<void> {
    if (!this.pagamento || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.subscription.mockDecide(this.pagamento, decision);
      await this.router.navigate(['/assinatura/retorno'], {
        queryParams: { status: decision === 'approved' ? 'approved' : 'failure' },
      });
    } catch (err) {
      const message = apiErrorInfo(err).message;
      this.error.set(message ?? 'Tente novamente.');
    } finally {
      this.busy.set(false);
    }
  }
}
