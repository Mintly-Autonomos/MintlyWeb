import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';

/** Ícone de ajuda com tooltip on hover/focus (equivalente ao Hint do base, sem depender de Radix). */
@Component({
  selector: 'app-hint',
  standalone: true,
  imports: [IconComponent],
  host: { class: 'inline-block' },
  template: `
    <span class="relative inline-grid group">
      <span
        tabindex="0"
        class="inline-grid place-items-center h-4 w-4 rounded-full text-muted-foreground hover:text-foreground cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
      >
        <app-icon name="help" [style]="{ fontSize: '14px' }" />
      </span>
      <span
        role="tooltip"
        class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-max max-w-[260px] rounded-xl border border-border bg-popover text-popover-foreground px-3 py-2 text-[12px] leading-relaxed opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 shadow-lg"
      >
        {{ text }}
      </span>
    </span>
  `,
})
export class HintComponent {
  @Input() text = '';
}
