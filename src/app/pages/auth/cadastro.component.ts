import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../shared/api-error-message';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AuthService } from '../../services/auth.service';
import { AlertComponent } from '../../shared/alert.component';
import { passwordRules } from '../../shared/password-rules';
import { maskPhoneBR } from '../../shared/format';

@Component({
  selector: 'app-cadastro',
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
    <app-auth-card
      title="Crie sua conta Mintly"
      subtitle="Crie sua conta em menos de 1 minuto. O Mintly funciona por assinatura: depois do cadastro você escolhe o plano e paga para liberar o acesso."
      [logoTo]="null"
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

        @if (step() === 0) {
          <app-alert variant="info" title="O Mintly é por assinatura">
            Planos de 1, 3, 6 ou 12 meses, a partir de R$ 149,90 por mês, com desconto nos planos
            mais longos. Você cria a conta agora e, em seguida, escolhe o plano e faz o pagamento. O
            acesso é liberado quando o pagamento é aprovado.
          </app-alert>
          <app-form-field label="Seu nome" icon="person">
            <input
              [(ngModel)]="name"
              name="name"
              placeholder="Ex.: Ana Costa"
              autocomplete="name"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <app-form-field label="Telefone" icon="phone" [error]="phoneError()">
            <input
              [ngModel]="phone"
              (ngModelChange)="onPhone($event)"
              (blur)="phoneTouched = true"
              name="phone"
              type="tel"
              inputmode="tel"
              placeholder="Ex.: (11) 99999-9999"
              autocomplete="tel"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <app-form-field
            label="E-mail"
            icon="mail"
            helper="Usaremos esse e-mail para você acessar a conta."
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
        }

        @if (step() === 1) {
          <app-form-field label="Senha" icon="lock">
            <input
              [type]="showPwd() ? 'text' : 'password'"
              [(ngModel)]="password"
              name="password"
              autocomplete="new-password"
              placeholder="Mínimo 8 caracteres"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            <button
              fieldSuffix
              type="button"
              [attr.aria-label]="showPwd() ? 'Ocultar senha' : 'Mostrar senha'"
              (click)="showPwd.set(!showPwd())"
              class="relative h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer before:absolute before:-inset-1 before:content-['']"
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
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
        }

        @if (step() === 2) {
          <app-form-field
            label="Nome do restaurante"
            icon="storefront"
            helper="Você poderá ajustar isso depois nas configurações."
          >
            <input
              [(ngModel)]="restaurant"
              name="restaurant"
              placeholder="Ex.: Cantina da Ana"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>
          <app-alert variant="info" title="O que preparamos para você">
            Ao concluir, criamos automaticamente categorias padrão (Venda Balcão, Delivery, CMV,
            Salários, Aluguel, Impostos) e uma conta financeira inicial. Antes disso, você escolhe o
            plano e paga a assinatura.
          </app-alert>
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              [(ngModel)]="terms"
              name="terms"
              class="mt-0.5 h-4 w-4 rounded border-border accent-mint"
            />
            <span class="text-[13px] text-foreground/80"
              >Li e concordo com os
              <a
                routerLink="/termos"
                target="_blank"
                rel="noopener"
                data-testid="link-termos"
                class="text-ocean font-medium hover:underline"
                >Termos de Uso</a
              >
              e com a
              <a
                routerLink="/privacidade"
                target="_blank"
                rel="noopener"
                data-testid="link-privacidade"
                class="text-ocean font-medium hover:underline"
                >Política de Privacidade</a
              >
              (abrem em outra aba)</span
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

  // Métodos (não computed()): name/phone/email/password/... são campos simples
  // (ngModel), não signals — um computed() aqui só reagiria à leitura de `step()`
  // e ficaria com cache travado a cada tecla digitada nos outros campos.
  protected rules() {
    return passwordRules(this.password);
  }

  protected canNext(): boolean {
    const s = this.step();
    if (s === 0)
      return this.name.trim().length > 1 && this.phoneValid() && /.+@.+\..+/.test(this.email);
    if (s === 1) return this.rules().every((r) => r.ok) && this.confirm === this.password;
    return this.restaurant.trim().length > 1 && this.terms;
  }

  /** Telefone BR: aceita só os dígitos e exige 10 (fixo) ou 11 (celular c/ 9). */
  protected phoneTouched = false;

  protected onPhone(value: string): void {
    this.phone = maskPhoneBR(value);
  }

  protected phoneError(): string {
    return this.phoneTouched && this.phone && !this.phoneValid()
      ? 'Informe DDD + número (10 ou 11 dígitos).'
      : '';
  }

  protected confirmError(): string {
    return this.confirm && this.confirm !== this.password ? 'As senhas não coincidem.' : '';
  }

  protected phoneValid(): boolean {
    const digits = this.phone.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11;
  }

  async onSubmit(): Promise<void> {
    if (!this.canNext()) return;
    this.error.set(null);
    if (this.step() < 2) {
      this.step.update((s) => s + 1);
      return;
    }
    this.loading.set(true);
    try {
      const email = this.email.trim();
      await this.auth.signup({
        name: this.name.trim(),
        phone: this.phone.replace(/\D/g, ''),
        email,
        password: this.password,
        restaurantName: this.restaurant.trim(),
        termsAccepted: this.terms,
      });
      // A assinatura vem antes de tudo: sem ela a API não libera nada. Depois de pagar, segue o onboarding.
      this.router.navigate(['/assinatura']);
    } catch (err) {
      this.error.set(this.errMsg(err));
    } finally {
      this.loading.set(false);
    }
  }

  private errMsg(err: unknown): string {
    return apiErrorMessage(
      err,
      'Não conseguimos criar sua conta. Verifique os dados e tente novamente.',
    );
  }
}
