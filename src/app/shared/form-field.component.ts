import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Shell de campo de formulário: rótulo + container com borda, ring de foco,
 * ícone opcional à esquerda e mensagem de erro. O controle (input/select)
 * é projetado via <ng-content>; um sufixo opcional via [fieldSuffix].
 *
 * Uso:
 *   <app-form-field label="E-mail" icon="mail" [error]="emailError">
 *     <input ... class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground" />
 *   </app-form-field>
 */
@Component({
  selector: 'app-form-field',
  standalone: true,
  host: { class: 'block' },
  imports: [IconComponent],
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/label-has-associated-control -->
    <label class="block">
      @if (label) {
        <span class="text-[13px] font-medium text-foreground block mb-1.5">{{ label }}</span>
      }
      <span [class]="shellClass">
        @if (icon) {
          <app-icon
            [name]="icon"
            [style]="{ fontSize: '20px' }"
            className="text-muted-foreground"
          />
        }
        <ng-content />
        <ng-content select="[fieldSuffix]" />
      </span>
      @if (error) {
        <p class="text-error text-[12px] mt-1">{{ error }}</p>
      }
    </label>
  `,
})
export class FormFieldComponent {
  @Input() label = '';
  @Input() icon = '';
  @Input() error = '';

  get shellClass(): string {
    const base =
      'flex items-center h-12 rounded-xl border bg-card px-3.5 gap-2.5 focus-within:ring-2 focus-within:ring-mint/40 focus-within:border-mint transition';
    return `${base} ${this.error ? 'border-error' : 'border-border'}`;
  }
}
