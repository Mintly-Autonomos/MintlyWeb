import { Component, Input, signal, computed } from '@angular/core';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface Segment extends DonutSlice {
  dasharray: string;
  dashoffset: number;
  pct: number;
}

/** Gráfico de rosca (substitui o PieChart do Recharts). A legenda fica a cargo de quem consome. */
@Component({
  selector: 'app-donut-chart',
  standalone: true,
  host: { class: 'block relative w-full h-full' },
  template: `
    <svg viewBox="0 0 100 100" class="w-full h-full block">
      <g transform="rotate(-90 50 50)">
        <circle
          cx="50"
          cy="50"
          [attr.r]="radius"
          fill="none"
          stroke="var(--muted)"
          stroke-width="14"
        />
        @for (s of segments(); track s.label) {
          <circle
            cx="50"
            cy="50"
            [attr.r]="radius"
            fill="none"
            [attr.stroke]="s.color"
            stroke-width="14"
            [attr.stroke-dasharray]="s.dasharray"
            [attr.stroke-dashoffset]="s.dashoffset"
            style="cursor:pointer; transition: opacity .15s"
            [style.opacity]="hover() === null || hover() === s.label ? 1 : 0.35"
            (mouseenter)="hover.set(s.label)"
            (mouseleave)="hover.set(null)"
          />
        }
      </g>
    </svg>

    @if (hover(); as h) {
      <div
        class="pointer-events-none absolute inset-0 grid place-items-center"
        style="pointer-events:none"
      >
        <div class="m3-card m3-elev rounded-xl px-3 py-2 text-[12px] text-center">
          <div class="font-semibold">{{ h }}</div>
          <div class="tabular-nums text-muted-foreground">
            {{ fmt(valueOf(h)) }} ({{ pctOf(h) }}%)
          </div>
        </div>
      </div>
    }
  `,
})
export class DonutChartComponent {
  @Input() data: DonutSlice[] = [];
  @Input() valueFormatter: (v: number) => string = (v) => String(v);

  protected readonly radius = 34;
  protected hover = signal<string | null>(null);

  protected segments = computed<Segment[]>(() => {
    const circumference = 2 * Math.PI * this.radius;
    const total = this.data.reduce((s, d) => s + d.value, 0) || 1;
    let offset = 0;
    const gap = this.data.length > 1 ? 1 : 0;
    return this.data.map((d) => {
      const len = Math.max(0, (d.value / total) * circumference - gap);
      const seg: Segment = {
        ...d,
        dasharray: `${len} ${circumference - len}`,
        dashoffset: -offset,
        pct: Math.round((d.value / total) * 100),
      };
      offset += (d.value / total) * circumference;
      return seg;
    });
  });

  protected fmt(v: number): string {
    return this.valueFormatter(v);
  }

  protected valueOf(label: string): number {
    return this.data.find((d) => d.label === label)?.value ?? 0;
  }

  protected pctOf(label: string): number {
    return this.segments().find((s) => s.label === label)?.pct ?? 0;
  }
}
