import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';

export interface StatDelta {
  value: string;
  up: boolean;
  /** Sem alteração: aparece neutro, nem verde nem vermelho. */
  flat?: boolean;
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
      style="container-type: inline-size"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-1 text-[12px] text-muted-foreground font-medium min-w-0">
          <span class="leading-tight break-words">{{ label }}</span>
          <ng-content select="[slot=hint]" />
        </div>
        <app-icon
          [name]="icon"
          className="text-muted-foreground shrink-0"
          [style]="{ fontSize: '18px' }"
        />
      </div>

      <div class="flex-1 flex items-center">
        <!-- O valor acompanha a largura do card (cqw): -R$ 10.421,77 cabe em card estreito sem vazar. -->
        <div
          class="leading-tight font-bold tracking-tight tabular-nums whitespace-nowrap"
          style="font-size: clamp(14px, 10cqw, 28px)"
        >
          {{ value }}
        </div>
      </div>

      <div class="min-h-[52px] flex flex-col justify-end gap-2">
        <ng-content select="[slot=badge]" />
        @if (subtext) {
          <div class="text-[12px] text-muted-foreground">{{ subtext }}</div>
        }
        @if (delta && temDelta) {
          <div [class]="deltaClass">
            <app-icon [name]="deltaIcon" [style]="{ fontSize: '16px' }" />
            @if (!delta.flat) {
              <span>{{ delta.up ? '▲' : '▼' }}</span>
            }
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

  /** Sem número (sem dado para comparar) não há o que mostrar: nada de legenda solta. */
  get temDelta(): boolean {
    const v = this.delta?.value?.trim();
    return !!v && v !== '—';
  }

  get deltaIcon(): string {
    if (this.delta?.flat) return 'trending_flat';
    return this.delta?.up ? 'trending_up' : 'trending_down';
  }

  get deltaClass(): string {
    const base = 'inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] font-semibold';
    if (this.delta?.flat) return `${base} text-muted-foreground`;
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
