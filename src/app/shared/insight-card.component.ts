import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IconComponent } from './icon.component';
import { ButtonComponent } from './button.component';

export type InsightSeverity = 'risco' | 'atencao' | 'oportunidade' | 'positivo';

interface SeverityMeta {
  icon: string;
  label: string;
  text: string;
  bg: string;
  ring: string;
}

const SEVERITY: Record<InsightSeverity, SeverityMeta> = {
  risco: {
    icon: 'report',
    label: 'Risco',
    text: 'text-error',
    bg: 'bg-error/10',
    ring: 'border-error/30',
  },
  atencao: {
    icon: 'warning',
    label: 'Atenção',
    text: 'text-warning',
    bg: 'bg-warning/10',
    ring: 'border-warning/30',
  },
  oportunidade: {
    icon: 'lightbulb',
    label: 'Oportunidade',
    text: 'text-ocean',
    bg: 'bg-ocean-soft',
    ring: 'border-ocean/25',
  },
  positivo: {
    icon: 'check_circle',
    label: 'Positivo',
    text: 'text-success',
    bg: 'bg-mint-soft',
    ring: 'border-mint/30',
  },
};

/** Card de insight (risco/atenção/oportunidade/positivo) com ação opcional. */
@Component({
  selector: 'app-insight-card',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  host: { class: 'block' },
  template: `
    <div
      [class]="
        'm3-card rounded-2xl p-5 border ' +
        meta.ring +
        ' flex flex-col transition-all duration-200 hover:m3-elev hover:-translate-y-0.5'
      "
    >
      <div class="flex items-center gap-2">
        <span [class]="'h-9 w-9 rounded-xl grid place-items-center ' + meta.bg + ' ' + meta.text">
          <app-icon [name]="meta.icon" [style]="{ fontSize: '20px' }" />
        </span>
        <span [class]="'text-[11px] font-bold uppercase tracking-wider ' + meta.text">{{
          meta.label
        }}</span>
      </div>
      <div class="mt-3 text-[14px] font-semibold leading-snug">{{ title }}</div>
      <p class="text-[13px] text-muted-foreground leading-relaxed mt-1.5 flex-1">
        {{ description }}
      </p>
      @if (action) {
        <div class="mt-4">
          <app-button variant="tonal" icon="arrow_forward" (clicked)="actionClick.emit()">
            {{ action }}
          </app-button>
        </div>
      }
    </div>
  `,
})
export class InsightCardComponent {
  @Input() severity: InsightSeverity = 'oportunidade';
  @Input() title = '';
  @Input() description = '';
  @Input() action = '';
  @Output() actionClick = new EventEmitter<void>();

  get meta(): SeverityMeta {
    return SEVERITY[this.severity];
  }
}
