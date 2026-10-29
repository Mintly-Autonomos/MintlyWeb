import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AlertComponent } from '../../shared/alert.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-esqueci-senha',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    AuthCardComponent,
    IconComponent,
    FormFieldComponent,
    AlertComponent,
  ],
  template: `
    @if (!sent()) {
      <app-auth-card
        title="Esqueceu a senha?"
        subtitle="Tudo bem, acontece. Informe seu e-mail e enviaremos um link seguro para redefinir."
        [hasFooter]="true"
      >
        <form (ngSubmit)="onSubmit()" class="space-y-4">
          @if (error()) {
            <app-alert variant="error">{{ error() }}</app-alert>
          }
          <app-form-field
            label="E-mail da conta"
            icon="mail"
            helper="Enviaremos o link de redefinição para esse endereço."
          >
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              placeholder="voce@restaurante.com"
              autocomplete="email"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <button
            type="submit"
            [disabled]="!email || loading()"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            @if (loading()) {
              <app-icon
                name="progress_activity"
                [style]="{ fontSize: '20px' }"
                className="animate-spin"
              /><span>Enviando…</span>
            } @else {
              <span>Enviar link de redefinição</span
              ><app-icon name="send" [style]="{ fontSize: '20px' }" />
            }
          </button>
          <button
            type="button"
            (click)="router.navigate(['/auth/login'])"
            class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <app-icon name="arrow_back" [style]="{ fontSize: '20px' }" />
            <span>Voltar para o login</span>
          </button>
        </form>
        <div slot="footer">
          <a
            routerLink="/auth/login"
            class="inline-flex items-center gap-1.5 text-ocean font-semibold hover:underline"
          >
            <app-icon name="arrow_back" [style]="{ fontSize: '16px' }" /> Voltar para o login
          </a>
        </div>
      </app-auth-card>
    } @else {
      <app-auth-card
        title="Verifique seu e-mail"
        subtitle="Se essa conta existir, enviamos um link para redefinir sua senha."
        [hasFooter]="true"
      >
        <div class="space-y-5">
          <div class="flex items-center justify-center">
            <div class="h-16 w-16 rounded-2xl bg-mint-soft grid place-items-center text-ocean">
              <app-icon name="mark_email_read" [style]="{ fontSize: '32px' }" />
            </div>
          </div>

          <app-alert variant="info" title="E-mail a caminho">
            Enviamos para <span class="font-semibold text-foreground break-all">{{ email }}</span
            >. O link expira em 1 hora por segurança.
          </app-alert>

          <ul class="space-y-2.5 text-[13px] text-muted-foreground">
            <li class="flex items-start gap-2">
              <app-icon
                name="check_circle"
                [style]="{ fontSize: '16px' }"
                className="text-mint mt-0.5"
              />
              <span>Procure também na caixa de spam ou promoções.</span>
            </li>
            <li class="flex items-start gap-2">
              <app-icon
                name="check_circle"
                [style]="{ fontSize: '16px' }"
                className="text-mint mt-0.5"
              />
              <span>O link só funciona uma vez. Use-o em um dispositivo confiável.</span>
            </li>
          </ul>

          <button
            type="button"
            (click)="sent.set(false)"
            class="w-full h-11 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted transition cursor-pointer"
          >
            Não recebi — tentar outro e-mail
          </button>
        </div>
        <div slot="footer">
          <a routerLink="/auth/login" class="text-ocean font-semibold hover:underline"
            >Voltar para o login</a
          >
        </div>
      </app-auth-card>
    }
  `,
})
export class EsqueciSenhaComponent {
  protected router = inject(Router);
  private auth = inject(AuthService);
  protected email = '';
  protected loading = signal(false);
  protected sent = signal(false);
  protected error = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    this.error.set(null);
    if (!/.+@.+\..+/.test(this.email.trim())) {
      this.error.set('Informe um e-mail válido para receber o link.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.forgotPassword(this.email.trim());
      this.sent.set(true);
    } catch {
      this.error.set('Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
    } finally {
      this.loading.set(false);
    }
  }
}
