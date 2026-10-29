import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';

type AlertVariant = 'info' | 'error' | 'success' | 'warning';

const MAP: Record<AlertVariant, { bg: string; icon: string; color: string; border: string }> = {
  info: { bg: 'bg-ocean-soft', icon: 'info', color: 'text-ocean', border: 'border-ocean/20' },
  error: { bg: 'bg-error/10', icon: 'error', color: 'text-error', border: 'border-error/20' },
  success: {
    bg: 'bg-mint-soft',
    icon: 'check_circle',
    color: 'text-ocean',
    border: 'border-mint/30',
  },
  warning: {
    bg: 'bg-warning/10',
    icon: 'warning',
    color: 'text-warning',
    border: 'border-warning/30',
  },
};

/** Caixa de aviso das telas de autenticação (equivale ao `Alert` do protótipo). */
@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [IconComponent],
  host: { class: 'block' },
  template: `
    <div [class]="'flex items-start gap-3 p-3.5 rounded-xl border ' + s.bg + ' ' + s.border">
      <app-icon
        [name]="s.icon"
        [style]="{ fontSize: '20px' }"
        [className]="s.color + ' shrink-0 mt-0.5'"
      />
      <div class="min-w-0 flex-1">
        @if (title) {
          <div class="text-sm font-semibold text-foreground">{{ title }}</div>
        }
        <div class="text-[13px] text-foreground/80 leading-relaxed"><ng-content /></div>
      </div>
    </div>
  `,
})
export class AlertComponent {
  @Input() variant: AlertVariant = 'info';
  @Input() title = '';

  get s() {
    return MAP[this.variant];
  }
}
