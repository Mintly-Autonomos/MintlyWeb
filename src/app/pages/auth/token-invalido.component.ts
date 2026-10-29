import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { AlertComponent } from '../../shared/alert.component';

@Component({
  selector: 'app-token-invalido',
  standalone: true,
  imports: [AuthCardComponent, IconComponent, AlertComponent],
  template: `
    <app-auth-card
      [wide]="true"
      title="Este link não é mais válido"
      subtitle="Por segurança, os links de recuperação expiram após 1 hora ou depois de serem usados uma vez."
    >
      <div class="flex items-center justify-center mb-2">
        <div class="h-16 w-16 rounded-2xl bg-warning/15 grid place-items-center text-warning">
          <app-icon name="link_off" [style]="{ fontSize: '32px' }" />
        </div>
      </div>

      <app-alert variant="info" title="Solicite um novo link">
        É rápido — enviaremos um novo e-mail com um link de recuperação válido por mais 1 hora.
      </app-alert>

      <div class="space-y-3 mt-5">
        <button
          type="button"
          (click)="router.navigate(['/auth/esqueci-senha'])"
          class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="send" [style]="{ fontSize: '20px' }" /><span>Solicitar novo link</span>
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
    </app-auth-card>
  `,
})
export class TokenInvalidoComponent {
  protected router = inject(Router);
}
