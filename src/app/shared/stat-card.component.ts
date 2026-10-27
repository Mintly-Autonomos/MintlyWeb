import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';

export interface StatDelta {
  value: string;
  up: boolean;
  note?: string;
}

/** KPI card: rótulo, valor grande, variação (delta) e sparkline opcional. Slots: hint/badge/footer. */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [IconComponent],
  host: { class: 'block' },
  template: `
    <div
      class="m3-card p-6 h-[200px] flex flex-col transition-all duration-200 hover:m3-elev hover:-translate-y-0.5"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-1 text-[12px] text-muted-foreground font-medium min-w-0">
          <span class="truncate">{{ label }}</span>
          <ng-content select="[slot=hint]" />
        </div>
        <app-icon
          [name]="icon"
          className="text-muted-foreground shrink-0"
          [style]="{ fontSize: '18px' }"
        />
      </div>

      <div class="flex-1 flex items-center">
        <div
          class="text-[22px] xl:text-[24px] 2xl:text-[28px] leading-tight font-bold tracking-tight tabular-nums whitespace-nowrap"
        >
          {{ value }}
        </div>
      </div>

      <div class="min-h-[52px] flex flex-col justify-end gap-2">
        <ng-content select="[slot=badge]" />
        @if (subtext) {
          <div class="text-[12px] text-muted-foreground">{{ subtext }}</div>
        }
        @if (delta) {
          <div [class]="deltaClass">
            <app-icon
              [name]="delta.up ? 'trending_up' : 'trending_down'"
              [style]="{ fontSize: '16px' }"
            />
            <span>{{ delta.up ? '▲' : '▼' }}</span>
            {{ delta.value }}
            <span class="text-muted-foreground font-normal">{{
              delta.note ?? 'vs. mês anterior'
            }}</span>
          </div>
        }
        @if (spark && spark.length > 1) {
          <svg
            viewBox="0 0 100 28"
            preserveAspectRatio="none"
            class="mt-1 w-full h-7"
            aria-hidden="true"
          >
            <polyline
              [attr.points]="sparkPoints"
              fill="none"
              [attr.stroke]="sparkColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        }
        <ng-content select="[slot=footer]" />
      </div>
    </div>
  `,
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value = '';
  @Input() icon = '';
  @Input() delta: StatDelta | null = null;
  @Input() status: 'positive' | 'warning' | 'negative' | 'neutral' = 'neutral';
  @Input() spark: number[] | null = null;
  @Input() subtext = '';

  get deltaClass(): string {
    const base = 'inline-flex items-center gap-1 text-[12px] font-semibold whitespace-nowrap';
    if (this.status === 'warning') return `${base} text-warning`;
    return `${base} ${this.delta?.up ? 'text-success' : 'text-error'}`;
  }

  get sparkColor(): string {
    const map: Record<string, string> = {
      positive: 'var(--success)',
      warning: 'var(--warning)',
      negative: 'var(--error)',
      neutral: 'var(--ocean)',
    };
    return map[this.status];
  }

  get sparkPoints(): string {
    const data = this.spark ?? [];
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const w = 100;
    const h = 28;
    return data
      .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`)
      .join(' ');
  }
}
