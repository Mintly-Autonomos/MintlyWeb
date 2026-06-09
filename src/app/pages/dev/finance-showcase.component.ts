import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AuditTimelineComponent, AuditEntry } from '../../shared/audit-timeline.component';
import { ToastService } from '../../shared/toast.service';

/**
 * Tela de visualização dos componentes compartilhados do app financeiro
 * (toast, form-field, audit-timeline). Segue a convenção do dev-test:
 * toda peça nova ganha um showcase para facilitar teste das variações.
 */
@Component({
  selector: 'app-finance-showcase',
  standalone: true,
  imports: [FormsModule, IconComponent, FormFieldComponent, AuditTimelineComponent],
  template: `
    <div class="p-6 max-w-5xl mx-auto space-y-10">
      <header>
        <h1 class="text-2xl font-bold tracking-tight">Componentes — Finance</h1>
        <p class="text-muted-foreground text-sm mt-1">
          Showcase dos componentes compartilhados do app financeiro e suas variações.
        </p>
      </header>

      <!-- Toast -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          app-toast (ToastService)
        </h2>
        <div class="flex flex-wrap gap-2">
          <button
            (click)="toast.success('Operação concluída com sucesso.')"
            class="h-10 px-4 rounded-xl bg-mint text-primary-foreground text-sm font-semibold hover:brightness-95 cursor-pointer"
          >
            Success
          </button>
          <button
            (click)="toast.error('Algo deu errado. Tente novamente.')"
            class="h-10 px-4 rounded-xl bg-error text-white text-sm font-semibold hover:brightness-95 cursor-pointer"
          >
            Error
          </button>
          <button
            (click)="toast.info('Mensagem informativa de exemplo.')"
            class="h-10 px-4 rounded-xl bg-ocean text-white text-sm font-semibold hover:brightness-95 cursor-pointer"
          >
            Info
          </button>
        </div>
        <p class="text-[12px] text-muted-foreground">
          Os toasts aparecem no canto inferior direito e somem sozinhos após 4s.
        </p>
      </section>

      <!-- FormField -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          app-form-field
        </h2>
        <div class="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <app-form-field label="Com ícone" icon="mail">
            <input
              type="email"
              [(ngModel)]="demoEmail"
              placeholder="voce@restaurante.com"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>

          <app-form-field label="Sem ícone">
            <input
              [(ngModel)]="demoText"
              placeholder="Texto livre"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>

          <app-form-field label="Com erro" icon="lock" error="Mensagem de erro de exemplo.">
            <input
              [(ngModel)]="demoErr"
              placeholder="Campo inválido"
              class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </app-form-field>

          <app-form-field label="Com sufixo (senha)" icon="lock">
            <input
              [type]="show() ? 'text' : 'password'"
              [(ngModel)]="demoPwd"
              placeholder="••••••••"
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
        </div>
      </section>

      <!-- AuditTimeline -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          app-audit-timeline
        </h2>
        <div class="m3-card p-5 max-w-md">
          <app-audit-timeline [events]="demoEvents" />
        </div>
      </section>
    </div>
  `,
})
export class FinanceShowcaseComponent {
  protected toast = inject(ToastService);
  protected show = signal(false);
  protected demoEmail = '';
  protected demoText = '';
  protected demoErr = '';
  protected demoPwd = '';

  protected demoEvents: AuditEntry[] = [
    {
      id: 3,
      at: '2025-05-04T14:10:00',
      by: 'Você (Marina S.)',
      action: 'Nome alterado',
      detail: 'Caixa → Caixa Loja',
      icon: 'edit',
    },
    {
      id: 2,
      at: '2025-03-02T09:00:00',
      by: 'Marina Souza',
      action: 'Definida como padrão',
      icon: 'star',
    },
    {
      id: 1,
      at: '2025-01-12T09:24:00',
      by: 'Marina Souza',
      action: 'Conta criada',
      detail: 'Tipo: Banco',
      icon: 'add_circle',
    },
  ];
}
