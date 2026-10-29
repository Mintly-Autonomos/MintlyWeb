import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { AlertComponent } from '../../shared/alert.component';

@Component({
  selector: 'app-bloqueado',
  standalone: true,
  imports: [AuthCardComponent, IconComponent, AlertComponent],
  template: `
    <app-auth-card
      [wide]="true"
      title="Acesso temporariamente bloqueado"
      subtitle="Detectamos várias tentativas de acesso em pouco tempo. Para proteger sua conta, pausamos os acessos por alguns minutos."
    >
      <div class="flex items-center justify-center mb-2">
        <div class="h-16 w-16 rounded-2xl bg-error/10 grid place-items-center text-error">
          <app-icon name="lock_clock" [style]="{ fontSize: '32px' }" />
        </div>
      </div>

      <app-alert variant="warning" title="O que você pode fazer agora">
        Aguarde alguns minutos e tente novamente, ou redefina sua senha caso não se lembre dela.
      </app-alert>

      <div class="space-y-3 mt-5">
        <button
          type="button"
          (click)="router.navigate(['/auth/esqueci-senha'])"
          class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="lock_reset" [style]="{ fontSize: '20px' }" /><span
            >Redefinir minha senha</span
          >
        </button>
        <button
          type="button"
          (click)="router.navigate(['/auth/login'])"
          class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="arrow_back" [style]="{ fontSize: '20px' }" /><span
            >Voltar para o login</span
          >
        </button>
      </div>

      <p class="mt-6 text-[12px] text-muted-foreground text-center">
        Precisa de ajuda?
        <a href="mailto:suporte@mintly.com.br" class="text-ocean font-medium hover:underline"
          >Fale com nosso suporte</a
        >.
      </p>
    </app-auth-card>
  `,
})
export class BloqueadoComponent {
  protected router = inject(Router);
}
