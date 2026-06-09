import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';

@Component({
  selector: 'app-redefinir-senha',
  standalone: true,
  imports: [FormsModule, AuthCardComponent, IconComponent, FormFieldComponent],
  template: `
    <app-auth-card title="Criar nova senha" subtitle="Escolha uma senha forte para proteger sua conta.">
      <form (ngSubmit)="onSubmit()" class="space-y-4">
        <app-form-field label="Nova senha" icon="lock">
          <input [type]="show() ? 'text' : 'password'" [(ngModel)]="password" name="password" placeholder="Mínimo 8 caracteres" class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground" />
          <button fieldSuffix type="button" (click)="show.set(!show())" class="h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer">
            <app-icon [name]="show() ? 'visibility_off' : 'visibility'" [style]="{fontSize:'18px'}" />
          </button>
        </app-form-field>
        <app-form-field label="Confirmar senha" icon="lock">
          <input type="password" [(ngModel)]="confirm" name="confirm" placeholder="Repita a senha" class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground" />
        </app-form-field>
        <button type="submit" [disabled]="loading() || password.length < 8 || password !== confirm" class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
          @if (loading()) { <app-icon name="progress_activity" [style]="{fontSize:'20px'}" className="animate-spin" /><span>Salvando…</span> }
          @else { <span>Salvar nova senha</span><app-icon name="check" [style]="{fontSize:'20px'}" /> }
        </button>
      </form>
    </app-auth-card>
  `,
})
export class RedefinirSenhaComponent {
  protected router = inject(Router);
  protected password = ''; protected confirm = '';
  protected show = signal(false); protected loading = signal(false);
  onSubmit(): void {
    if (this.password.length < 8 || this.password !== this.confirm) return;
    this.loading.set(true);
    // TODO: POST /api/auth/reset-password { token, password }
    setTimeout(() => this.router.navigate(['/auth/login'], { queryParams: { reset: 'ok' } }), 800);
  }
}
