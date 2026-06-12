import { Component, signal, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AuthService } from '../../services/auth.service';

function passwordRules(p: string) {
  return [
    { label: 'Mínimo 8 caracteres', ok: p.length >= 8 },
    { label: 'Letra maiúscula', ok: /[A-Z]/.test(p) },
    { label: 'Letra minúscula', ok: /[a-z]/.test(p) },
    { label: 'Número ou símbolo', ok: /[\d\W]/.test(p) },
  ];
}

@Component({
  selector: 'app-cadastro',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthCardComponent, IconComponent, FormFieldComponent],
  template: `
    <app-auth-card
      title="Crie sua conta Mintly"
      subtitle="Comece grátis em menos de 1 minuto. Sem cartão de crédito."
      [hasFooter]="true"
    >
      <!-- Stepper -->
      <div class="flex items-center gap-2 mb-6">
        @for (s of steps; track s; let i = $index) {
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <div
              [class]="
                'h-7 w-7 rounded-full grid place-items-center text-[12px] font-semibold shrink-0 ' +
                (i < step()
                  ? 'bg-mint text-primary-foreground'
                  : i === step()
                    ? 'bg-ocean text-white'
                    : 'bg-muted text-muted-foreground')
              "
            >
              @if (i < step()) {
                <app-icon name="check" [style]="{ fontSize: '14px' }" />
              } @else {
                {{ i + 1 }}
              }
            </div>
            <span
              [class]="
                'text-[12px] font-medium truncate ' +
                (i === step() ? 'text-foreground' : 'text-muted-foreground')
              "
              >{{ s }}</span
            >
            @if (i < steps.length - 1) {
              <span class="flex-1 h-px bg-border"></span>
            }
          </div>
        }
      </div>

      <form (ngSubmit)="onSubmit()" class="space-y-4">
        @if (step() === 0) {
          <app-form-field label="Seu nome" icon="person">
            <input
              [(ngModel)]="name"
              name="name"
              placeholder="Ex.: Ana Costa"
              autocomplete="name"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <app-form-field label="Telefone" icon="phone">
            <input
              type="tel"
              [(ngModel)]="phone"
              name="phone"
              placeholder="(11) 9 9999-9999"
              autocomplete="tel"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <app-form-field label="E-mail" icon="mail">
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              placeholder="voce@restaurante.com"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
        }

        @if (step() === 1) {
          <app-form-field label="Senha" icon="lock">
            <input
              [type]="showPwd() ? 'text' : 'password'"
              [(ngModel)]="password"
              name="password"
              placeholder="Mínimo 8 caracteres"
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
          <app-form-field label="Confirmar senha" icon="lock">
            <input
              type="password"
              [(ngModel)]="confirm"
              name="confirm"
              placeholder="Repita a senha"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
        }

        @if (step() === 2) {
          <app-form-field label="Nome do restaurante" icon="storefront">
            <input
              [(ngModel)]="restaurant"
              name="restaurant"
              placeholder="Ex.: Cantina da Ana"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              [(ngModel)]="terms"
              name="terms"
              class="mt-0.5 h-4 w-4 rounded border-border accent-mint"
            />
            <span class="text-[13px] text-foreground/80"
              >Concordo com os <span class="text-ocean font-medium">Termos de Uso</span> e
              <span class="text-ocean font-medium">Política de Privacidade</span></span
            >
          </label>
        }

        <button
          type="submit"
          [disabled]="!canNext() || loading()"
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
            <span>{{ step() < 2 ? 'Continuar' : 'Criar conta' }}</span>
            <app-icon name="arrow_forward" [style]="{ fontSize: '20px' }" />
          }
        </button>

        @if (error()) {
          <div class="flex items-start gap-3 p-3.5 rounded-xl border bg-error/10 border-error/20">
            <app-icon name="error" [style]="{ fontSize: '20px' }" className="text-error shrink-0 mt-0.5" />
            <div class="text-[13px] text-foreground/80">{{ error() }}</div>
          </div>
        }

        @if (step() > 0) {
          <button
            type="button"
            (click)="step.set(step() - 1)"
            class="w-full h-10 rounded-xl border border-border bg-card text-foreground text-sm hover:bg-muted transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <app-icon name="arrow_back" [style]="{ fontSize: '18px' }" />
            Voltar
          </button>
        }
      </form>

      <div slot="footer">
        Já tem conta?
        <a routerLink="/auth/login" class="text-ocean font-semibold hover:underline">Fazer login</a>
      </div>
    </app-auth-card>
  `,
})
export class CadastroComponent {
  protected router = inject(Router);
  private auth = inject(AuthService);

  protected steps = ['Seus dados', 'Acesso', 'Negócio'];
  protected step = signal(0);
  protected name = '';
  protected phone = '';
  protected email = '';
  protected password = '';
  protected confirm = '';
  protected restaurant = '';
  protected terms = false;
  protected showPwd = signal(false);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected rules = computed(() => passwordRules(this.password));

  protected canNext = computed(() => {
    const s = this.step();
    if (s === 0) return this.name.trim().length > 1 && this.phone.trim().length > 5 && /.+@.+\..+/.test(this.email);
    if (s === 1) return this.rules().every((r) => r.ok) && this.confirm === this.password;
    return this.restaurant.trim().length > 1 && this.terms;
  });

  async onSubmit(): Promise<void> {
    this.error.set(null);
    if (!this.canNext()) return;
    if (this.step() < 2) { this.step.update((s) => s + 1); return; }
    this.loading.set(true);
    try {
      await this.auth.signup({
        name: this.name,
        phone: this.phone,
        email: this.email,
        password: this.password,
        restaurantName: this.restaurant,
        termsAccepted: this.terms,
      });
      this.router.navigate(['/auth/onboarding']);
    } catch {
      this.error.set('Não foi possível criar a conta. Verifique os dados e tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }
}
