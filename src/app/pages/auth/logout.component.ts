import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { AuthService } from '../../services/auth.service';

/** "Sair da conta": encerra a sessão e mostra a despedida (como no protótipo) em vez de ir direto ao login. */
@Component({
  selector: 'app-logout',
  standalone: true,
  imports: [AuthCardComponent, IconComponent],
  template: `
    <app-auth-card
      [wide]="true"
      title="Você saiu com segurança"
      subtitle="Sua sessão foi encerrada. Até a próxima!"
    >
      <div class="flex items-center justify-center mb-2">
        <div class="h-16 w-16 rounded-2xl bg-mint-soft grid place-items-center text-ocean">
          <app-icon name="waving_hand" [style]="{ fontSize: '32px' }" />
        </div>
      </div>

      <div class="space-y-3 mt-4">
        <button
          type="button"
          (click)="router.navigate(['/auth/login'])"
          class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="login" [style]="{ fontSize: '20px' }" /><span>Entrar de novo</span>
        </button>
        <button
          type="button"
          (click)="router.navigate(['/auth/cadastro'])"
          class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="person_add" [style]="{ fontSize: '20px' }" /><span
            >Criar uma nova conta</span
          >
        </button>
      </div>
    </app-auth-card>
  `,
})
export class LogoutComponent implements OnInit {
  private auth = inject(AuthService);
  protected router = inject(Router);

  ngOnInit(): void {
    // Sem redirecionar: a tela de despedida é o destino.
    void this.auth.logout(false);
  }
}
