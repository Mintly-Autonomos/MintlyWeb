import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-sessao-expirada',
  standalone: true,
  imports: [AuthCardComponent, IconComponent],
  template: `
    <app-auth-card [wide]="true" title="Sua sessão expirou" subtitle="Por segurança, encerramos sua sessão após um período sem atividade. Faça login novamente para continuar.">
      <div class="flex items-center justify-center mb-2">
        <div class="h-16 w-16 rounded-2xl bg-warning/15 grid place-items-center text-warning">
          <app-icon name="schedule" [style]="{fontSize:'32px'}" />
        </div>
      </div>
      <div class="space-y-3 mt-4">
        <button type="button" (click)="router.navigate(['/auth/login'])" class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer">
          <span>Entrar novamente</span>
          <app-icon name="login" [style]="{fontSize:'20px'}" />
        </button>
        <button type="button" (click)="router.navigate(['/auth/esqueci-senha'])" class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted transition flex items-center justify-center gap-2 cursor-pointer">
          <app-icon name="help" [style]="{fontSize:'20px'}" />
          <span>Esqueci minha senha</span>
        </button>
      </div>
      <p class="mt-6 text-[12px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
        <app-icon name="shield" [style]="{fontSize:'14px'}" className="text-mint" />
        Mantemos suas informações protegidas com criptografia.
      </p>
    </app-auth-card>
  `,
})
export class SessaoExpiradaComponent {
  protected router = inject(Router);
}
