import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { FormFieldComponent } from '../../shared/form-field.component';
import { AuditTimelineComponent, AuditEntry } from '../../shared/audit-timeline.component';
import { ButtonComponent } from '../../shared/button.component';
import { ChipComponent } from '../../shared/chip.component';
import { ToggleComponent } from '../../shared/toggle.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ModalComponent } from '../../shared/modal.component';
import { ToastService } from '../../shared/toast.service';

/**
 * Galeria dos componentes compartilhados do design system do finance.
 * Cada seção mostra as variações de um componente e permite testá-las
 * (toast, modal, toggle são interativos). É a tela de visualização do /dev.
 */
@Component({
  selector: 'app-finance-showcase',
  standalone: true,
  imports: [
    FormsModule,
    IconComponent,
    FormFieldComponent,
    AuditTimelineComponent,
    ButtonComponent,
    ChipComponent,
    ToggleComponent,
    EmptyStateComponent,
    ModalComponent,
  ],
  template: `
    <div class="space-y-10">
      <!-- Toast -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Toast (ToastService)
        </h2>
        <div class="flex flex-wrap gap-2">
          <app-button
            variant="filled"
            icon="check_circle"
            (clicked)="toast.success('Operação concluída com sucesso.')"
          >
            Success
          </app-button>
          <app-button
            variant="danger"
            icon="error"
            (clicked)="toast.error('Algo deu errado. Tente novamente.')"
          >
            Error
          </app-button>
          <app-button
            variant="tonal"
            icon="info"
            (clicked)="toast.info('Mensagem informativa de exemplo.')"
          >
            Info
          </app-button>
        </div>
      </section>

      <!-- Button -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Button (app-button)
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <app-button variant="filled">Filled</app-button>
          <app-button variant="tonal">Tonal</app-button>
          <app-button variant="outlined">Outlined</app-button>
          <app-button variant="text">Text</app-button>
          <app-button variant="danger">Danger</app-button>
          <app-button variant="filled" icon="add">Com ícone</app-button>
          <app-button variant="outlined" [disabled]="true">Desabilitado</app-button>
        </div>
      </section>

      <!-- Chip -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Chip (app-chip)
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <app-chip tone="neutral" label="Neutral" />
          <app-chip tone="mint" icon="star" label="Mint" />
          <app-chip tone="ocean" label="Ocean" />
          <app-chip tone="success" icon="check_circle" label="Success" />
          <app-chip tone="warning" icon="schedule" label="Warning" />
          <app-chip tone="error" icon="cancel" label="Error" />
        </div>
      </section>

      <!-- Toggle -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Toggle (app-toggle)
        </h2>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <app-toggle [checked]="toggleOn()" (changed)="toggleOn.set($event)" />
            <span class="text-sm text-muted-foreground">{{
              toggleOn() ? 'Ligado' : 'Desligado'
            }}</span>
          </div>
          <div class="flex items-center gap-2">
            <app-toggle [checked]="true" [disabled]="true" />
            <span class="text-sm text-muted-foreground">Desabilitado</span>
          </div>
        </div>
      </section>

      <!-- FormField -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          FormField (app-form-field)
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

      <!-- Modal -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Modal (app-modal)
        </h2>
        <div class="flex flex-wrap gap-2">
          <app-button variant="outlined" icon="open_in_full" (clicked)="modalOpen.set(true)">
            Abrir modal (md)
          </app-button>
          <app-button variant="outlined" icon="open_in_full" (clicked)="modalLgOpen.set(true)">
            Abrir modal (lg)
          </app-button>
        </div>
      </section>

      <!-- AuditTimeline -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          AuditTimeline (app-audit-timeline)
        </h2>
        <div class="m3-card p-5 max-w-md">
          <app-audit-timeline [events]="demoEvents" />
        </div>
      </section>

      <!-- EmptyState -->
      <section class="space-y-3">
        <h2 class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          EmptyState (app-empty-state)
        </h2>
        <div class="m3-card max-w-md">
          <app-empty-state
            icon="receipt_long"
            title="Nada por aqui ainda"
            description="Exemplo de estado vazio usado nas listas do app."
          />
        </div>
      </section>
    </div>

    @if (modalOpen()) {
      <app-modal
        title="Modal de exemplo"
        subtitle="Tamanho médio · feche com Esc, clique no backdrop ou no X"
        [hasFooter]="true"
        (closed)="modalOpen.set(false)"
      >
        <p class="text-sm text-foreground/80">
          Conteúdo de demonstração. O scroll do body fica travado enquanto o modal está aberto.
        </p>
        <div slot="footer">
          <app-button variant="outlined" (clicked)="modalOpen.set(false)">Cancelar</app-button>
          <app-button variant="filled" (clicked)="modalOpen.set(false)">Confirmar</app-button>
        </div>
      </app-modal>
    }

    @if (modalLgOpen()) {
      <app-modal
        title="Modal grande"
        subtitle="Tamanho lg"
        size="lg"
        [hasFooter]="false"
        (closed)="modalLgOpen.set(false)"
      >
        <p class="text-sm text-foreground/80">Variação de modal com largura maior e sem rodapé.</p>
      </app-modal>
    }
  `,
})
export class FinanceShowcaseComponent {
  protected toast = inject(ToastService);
  protected show = signal(false);
  protected toggleOn = signal(true);
  protected modalOpen = signal(false);
  protected modalLgOpen = signal(false);
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
