import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-token-invalido',
  standalone: true,
  imports: [AuthCardComponent, IconComponent],
  template: `
    <app-auth-card
      [wide]="true"
      title="Link inválido ou expirado"
      subtitle="O link que você usou não é mais válido. Solicite um novo para continuar."
    >
      <div class="flex items-center justify-center mb-4">
        <div class="h-16 w-16 rounded-2xl bg-error/10 grid place-items-center text-error">
          <app-icon name="link_off" [style]="{ fontSize: '32px' }" />
        </div>
      </div>
      <div class="space-y-3">
        <button
          type="button"
          (click)="router.navigate(['/auth/esqueci-senha'])"
          class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Solicitar novo link</span><app-icon name="send" [style]="{ fontSize: '20px' }" />
        </button>
        <button
          type="button"
          (click)="router.navigate(['/auth/login'])"
          class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="login" [style]="{ fontSize: '20px' }" /><span>Voltar ao login</span>
        </button>
      </div>
    </app-auth-card>
  `,
})
export class TokenInvalidoComponent {
  protected router = inject(Router);
}
