import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface ToggleGroupOption {
  value: string;
  label: string;
}

/** Segmented control genérico (pill group) usado nos filtros das telas de relatório. */
@Component({
  selector: 'app-toggle-group',
  standalone: true,
  host: { class: 'inline-block' },
  template: `
    <div
      role="group"
      [attr.aria-label]="ariaLabel"
      class="inline-flex flex-wrap items-center gap-1 p-1 rounded-full border border-border bg-card"
    >
      @for (o of options; track o.value) {
        <button
          type="button"
          (click)="valueChange.emit(o.value)"
          [attr.aria-pressed]="value === o.value"
          [class]="
            'h-7 px-3 rounded-full text-[12px] font-semibold transition-colors duration-150 cursor-pointer ' +
            (value === o.value
              ? 'bg-mint-soft text-ocean'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground')
          "
        >
          {{ o.label }}
        </button>
      }
    </div>
  `,
})
export class ToggleGroupComponent {
  @Input() value = '';
  @Input() options: ToggleGroupOption[] = [];
  @Input() ariaLabel = '';
  @Output() valueChange = new EventEmitter<string>();
}
