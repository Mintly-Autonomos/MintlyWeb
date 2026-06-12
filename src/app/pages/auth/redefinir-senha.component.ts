import { Component, signal, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-redefinir-senha',
  standalone: true,
  imports: [FormsModule, AuthCardComponent, IconComponent, FormFieldComponent],
  template: `
    <app-auth-card
      title="Criar nova senha"
      subtitle="Escolha uma senha forte para proteger sua conta."
    >
      @if (invalidToken()) {
        <div class="text-center space-y-4">
          <div class="mx-auto h-16 w-16 rounded-2xl bg-error/10 grid place-items-center">
            <app-icon name="link_off" [style]="{ fontSize: '32px' }" className="text-error" />
          </div>
          <div>
            <div class="font-semibold text-[15px]">Link inválido ou expirado</div>
            <p class="text-[13px] text-muted-foreground mt-1">
              Solicite um novo link de recuperação de senha.
            </p>
          </div>
          <button
            type="button"
            (click)="router.navigate(['/auth/esqueci-senha'])"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Solicitar novo link</span>
          </button>
        </div>
      } @else {
        <form (ngSubmit)="onSubmit()" class="space-y-4">
          @if (error()) {
            <div class="flex items-start gap-3 p-3.5 rounded-xl border bg-error/10 border-error/20">
              <app-icon name="error" [style]="{ fontSize: '20px' }" className="text-error shrink-0 mt-0.5" />
              <div class="text-[13px] text-foreground/80">{{ error() }}</div>
            </div>
          }
          <app-form-field label="Nova senha" icon="lock">
            <input
              [type]="show() ? 'text' : 'password'"
              [(ngModel)]="password"
              name="password"
              placeholder="Mínimo 8 caracteres"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            <button
              fieldSuffix
              type="button"
              (click)="show.set(!show())"
              class="h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer"
            >
              <app-icon
                [name]="show() ? 'visibility_off' : 'visibility'"
                [style]="{ fontSize: '18px' }"
              />
            </button>
          </app-form-field>
          <app-form-field label="Confirmar senha" icon="lock">
            <input
              type="password"
              [(ngModel)]="confirm"
              name="confirm"
              placeholder="Repita a senha"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <button
            type="submit"
            [disabled]="loading() || password.length < 8 || password !== confirm"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            @if (loading()) {
              <app-icon
                name="progress_activity"
                [style]="{ fontSize: '20px' }"
                className="animate-spin"
              /><span>Salvando…</span>
            } @else {
              <span>Salvar nova senha</span><app-icon name="check" [style]="{ fontSize: '20px' }" />
            }
          </button>
        </form>
      }
    </app-auth-card>
  `,
})
export class RedefinirSenhaComponent implements OnInit {
  protected router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  protected password = '';
  protected confirm = '';
  protected show = signal(false);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected invalidToken = signal(false);

  private token = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) this.invalidToken.set(true);
  }

  async onSubmit(): Promise<void> {
    this.error.set(null);
    if (this.password.length < 8 || this.password !== this.confirm) return;
    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.token, this.password, this.confirm);
      this.router.navigate(['/auth/login'], { queryParams: { reset: 'ok' } });
    } catch {
      this.error.set('Link inválido ou expirado. Solicite um novo link de recuperação.');
      this.invalidToken.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
