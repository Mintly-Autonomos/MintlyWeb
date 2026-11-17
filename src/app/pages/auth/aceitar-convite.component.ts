import { Component, OnInit, signal, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { apiErrorMessage } from '../../shared/api-error-message';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AlertComponent } from '../../shared/alert.component';
import { AuthService } from '../../services/auth.service';
import { passwordRules } from '../../shared/password-rules';

/**
 * Aceitar o convite de funcionário (relatório Sweetie Bel, E.1): o link do e-mail traz o token. A tela mostra
 * para quem é o convite, a pessoa cria a senha e segue para o login com o e-mail já preenchido.
 */
@Component({
  selector: 'app-aceitar-convite',
  standalone: true,
  imports: [FormsModule, AuthCardComponent, IconComponent, FormFieldComponent, AlertComponent],
  template: `
    <app-auth-card [title]="titulo()" [subtitle]="subtitulo()">
      @if (carregando()) {
        <div class="h-40 rounded-xl bg-muted animate-pulse" data-testid="convite-carregando"></div>
      } @else if (invalido()) {
        <div class="space-y-5" data-testid="convite-invalido">
          <app-alert variant="error" title="Este convite não vale mais">
            O link já foi usado, venceu ou foi trocado por um novo. Peça ao dono do restaurante para
            reenviar o convite.
          </app-alert>
          <button
            type="button"
            (click)="router.navigate(['/auth/login'])"
            class="w-full h-12 rounded-xl border border-border bg-card font-semibold text-sm hover:bg-muted cursor-pointer"
          >
            Ir para o login
          </button>
        </div>
      } @else {
        <form (ngSubmit)="onSubmit()" class="space-y-4" data-testid="convite-form">
          @if (error()) {
            <div
              role="alert"
              class="flex items-start gap-3 p-3.5 rounded-xl border bg-error/10 border-error/20"
            >
              <app-icon
                name="error"
                [style]="{ fontSize: '20px' }"
                className="text-error shrink-0 mt-0.5"
              />
              <div class="text-[13px] text-foreground/80">{{ error() }}</div>
            </div>
          }
          <div class="rounded-xl bg-muted/60 p-3 text-[13px]" data-testid="convite-para">
            <div class="text-muted-foreground">Seu login</div>
            <div class="font-semibold break-all">{{ email() }}</div>
          </div>
          <app-form-field label="Crie sua senha" icon="lock">
            <input
              [type]="show() ? 'text' : 'password'"
              [(ngModel)]="password"
              name="password"
              autocomplete="new-password"
              placeholder="Mínimo 8 caracteres"
              data-testid="convite-senha"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            <button
              fieldSuffix
              type="button"
              [attr.aria-label]="show() ? 'Ocultar senha' : 'Mostrar senha'"
              (click)="show.set(!show())"
              class="relative h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer before:absolute before:-inset-1 before:content-['']"
            >
              <app-icon
                [name]="show() ? 'visibility_off' : 'visibility'"
                [style]="{ fontSize: '18px' }"
              />
            </button>
          </app-form-field>
          <div class="grid grid-cols-2 gap-1.5">
            @for (r of rules(); track r.label) {
              <div
                [class]="
                  'flex items-center gap-1.5 text-[12px] ' +
                  (r.ok ? 'text-success' : 'text-muted-foreground')
                "
              >
                <app-icon
                  [name]="r.ok ? 'check_circle' : 'radio_button_unchecked'"
                  [style]="{ fontSize: '14px' }"
                />
                {{ r.label }}
              </div>
            }
          </div>
          <app-form-field
            label="Confirmar senha"
            icon="lock"
            [error]="confirmError()"
            [helper]="confirm && confirm === password ? 'Senhas conferem.' : ''"
          >
            <input
              type="password"
              [(ngModel)]="confirm"
              name="confirm"
              autocomplete="new-password"
              placeholder="Repita a senha"
              data-testid="convite-confirma"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <button
            type="submit"
            [disabled]="loading() || !canSubmit()"
            data-testid="convite-enviar"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            @if (loading()) {
              <app-icon
                name="progress_activity"
                [style]="{ fontSize: '20px' }"
                className="animate-spin"
              /><span>Salvando…</span>
            } @else {
              <span>Criar senha e entrar</span
              ><app-icon name="check" [style]="{ fontSize: '20px' }" />
            }
          </button>
        </form>
      }
    </app-auth-card>
  `,
})
export class AceitarConviteComponent implements OnInit {
  protected router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  protected password = '';
  protected confirm = '';
  protected show = signal(false);
  protected carregando = signal(true);
  protected invalido = signal(false);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected nome = signal('');
  protected email = signal('');
  protected restaurante = signal('');
  private token = '';

  protected titulo(): string {
    if (this.carregando() || this.invalido()) return 'Convite do Mintly';
    return this.nome() ? `Olá, ${this.nome().split(' ')[0]}` : 'Você foi convidado';
  }

  protected subtitulo(): string {
    if (this.carregando() || this.invalido()) return '';
    return this.restaurante()
      ? `Crie sua senha para entrar no Mintly de ${this.restaurante()}.`
      : 'Crie sua senha para entrar no Mintly.';
  }

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.invalido.set(true);
      this.carregando.set(false);
      return;
    }
    try {
      const preview = await this.auth.invitePreview(this.token);
      this.nome.set(preview.name);
      this.email.set(preview.email);
      this.restaurante.set(preview.restaurantName);
    } catch {
      this.invalido.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  protected confirmError(): string {
    return this.confirm && this.confirm !== this.password ? 'As senhas não coincidem.' : '';
  }

  // Método (não computed()): password/confirm são campos ngModel, não signals.
  protected rules() {
    return passwordRules(this.password);
  }

  protected canSubmit(): boolean {
    return this.rules().every((r) => r.ok) && this.password === this.confirm;
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.acceptInvite(this.token, this.password, this.confirm);
      this.router.navigate(['/auth/login'], {
        queryParams: { convite: 'ok', email: this.email() },
      });
    } catch (err) {
      this.error.set(
        apiErrorMessage(err, 'Não foi possível criar a senha. O link pode ter vencido.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
