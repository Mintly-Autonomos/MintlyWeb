import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthCardComponent, IconComponent, FormFieldComponent],
  template: `
    <app-auth-card
      title="Bem-vindo de volta"
      subtitle="Acesse sua conta para continuar gerenciando as finanças do seu negócio."
      [hasFooter]="true"
    >
      <form (ngSubmit)="onSubmit()" class="space-y-4">
        @if (error()) {
          <div class="flex items-start gap-3 p-3.5 rounded-xl border bg-error/10 border-error/20">
            <app-icon
              name="error"
              [style]="{ fontSize: '20px' }"
              className="text-error shrink-0 mt-0.5"
            />
            <div class="text-[13px] text-foreground/80">{{ error() }}</div>
          </div>
        }

        <app-form-field label="E-mail" icon="mail">
          <input
            type="email"
            [(ngModel)]="email"
            name="email"
            placeholder="voce@restaurante.com"
            autocomplete="email"
            class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </app-form-field>

        <app-form-field label="Senha" icon="lock">
          <input
            [type]="showPwd() ? 'text' : 'password'"
            [(ngModel)]="password"
            name="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <button
            fieldSuffix
            type="button"
            (click)="showPwd.set(!showPwd())"
            class="h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer"
          >
            <app-icon
              [name]="showPwd() ? 'visibility_off' : 'visibility'"
              [style]="{ fontSize: '18px' }"
            />
          </button>
        </app-form-field>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              [(ngModel)]="remember"
              name="remember"
              class="h-4 w-4 rounded border-border accent-mint"
            />
            <span class="text-[13px] text-foreground/80">Manter conectado</span>
          </label>
          <a
            routerLink="/auth/esqueci-senha"
            class="text-[13px] text-ocean font-medium hover:underline"
            >Esqueci minha senha</a
          >
        </div>

        <button
          type="submit"
          [disabled]="loading()"
          class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          @if (loading()) {
            <app-icon
              name="progress_activity"
              [style]="{ fontSize: '20px' }"
              className="animate-spin"
            />
            <span>Processando…</span>
          } @else {
            <span>Entrar</span>
            <app-icon name="arrow_forward" [style]="{ fontSize: '20px' }" />
          }
        </button>

        <div class="flex items-center gap-3 my-2">
          <span class="flex-1 h-px bg-border"></span>
          <span class="text-[11px] uppercase tracking-wider text-muted-foreground">ou</span>
          <span class="flex-1 h-px bg-border"></span>
        </div>

        <button
          type="button"
          (click)="router.navigate(['/auth/cadastro'])"
          class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <app-icon name="person_add" [style]="{ fontSize: '20px' }" />
          <span>Criar uma conta gratuita</span>
        </button>

        <p class="flex items-start gap-2 text-[12px] text-muted-foreground pt-1">
          <app-icon
            name="shield"
            [style]="{ fontSize: '16px' }"
            className="text-mint mt-0.5 shrink-0"
          />
          <span>Para sua segurança, nunca compartilhamos seus dados de acesso.</span>
        </p>
      </form>

      <div slot="footer">
        Não tem conta?
        <a routerLink="/auth/cadastro" class="text-ocean font-semibold hover:underline"
          >Criar gratuitamente</a
        >
      </div>
    </app-auth-card>
  `,
})
export class LoginComponent {
  protected router = inject(Router);
  private auth = inject(AuthService);
  protected email = '';
  protected password = '';
  protected remember = true;
  protected showPwd = signal(false);
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    this.error.set(null);
    if (!this.email || !this.password) {
      this.error.set('Preencha seu e-mail e senha para continuar.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password, this.remember);
      this.router.navigate(['/']);
    } catch {
      this.error.set('Não conseguimos entrar com esses dados. Verifique e tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }
}
