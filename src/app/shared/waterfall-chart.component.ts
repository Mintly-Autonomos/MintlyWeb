import {
  Component,
  Input,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  signal,
  computed,
  inject,
} from '@angular/core';

export interface WaterfallRow {
  label: string;
  value: number;
  kind: 'start' | 'down' | 'up' | 'end';
}

interface ComputedBar extends WaterfallRow {
  base: number;
  bar: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  topY: number;
}

/** Gráfico de cascata (bruto → líquido, etc.), com conectores tracejados entre barras. */
@Component({
  selector: 'app-waterfall-chart',
  standalone: true,
  host: { class: 'block relative w-full h-full' },
  template: `
    @if (hasData) {
      <svg
        [attr.viewBox]="'0 0 ' + size().w + ' ' + size().h"
        class="w-full h-full block"
        (mouseleave)="hover.set(null)"
      >
        @for (t of valueTicks(); track t.pos) {
          <line
            [attr.x1]="padLeft"
            [attr.x2]="size().w - padRight"
            [attr.y1]="t.pos"
            [attr.y2]="t.pos"
            stroke="var(--border)"
            stroke-dasharray="3 3"
          />
          <text
            [attr.x]="padLeft - 8"
            [attr.y]="t.pos"
            text-anchor="end"
            dominant-baseline="middle"
            font-size="11"
            fill="var(--muted-foreground)"
          >
            {{ t.label }}
          </text>
        }

        @for (seg of connectors(); track $index) {
          <line
            [attr.x1]="seg.x1"
            [attr.x2]="seg.x2"
            [attr.y1]="seg.y"
            [attr.y2]="seg.y"
            stroke="var(--border)"
            stroke-width="1"
            stroke-dasharray="3 3"
          />
        }

        @for (b of bars(); track b.label) {
          <rect
            [attr.x]="b.x"
            [attr.y]="b.y"
            [attr.width]="b.width"
            [attr.height]="b.height"
            [attr.fill]="b.color"
            rx="8"
            style="cursor:pointer"
            (mouseenter)="hover.set(b)"
            (mousemove)="hover.set(b)"
          />
          <text
            [attr.x]="b.x + b.width / 2"
            [attr.y]="b.topY - 10"
            text-anchor="middle"
            font-size="10.5"
            font-weight="600"
            fill="var(--muted-foreground)"
          >
            {{ brl(b.value) }}
          </text>
          <text
            [attr.x]="b.x + b.width / 2"
            [attr.y]="size().h - padBottom + 16"
            text-anchor="middle"
            font-size="11"
            fill="var(--muted-foreground)"
          >
            {{ b.label }}
          </text>
        }
      </svg>

      @if (hover(); as h) {
        <div
          class="pointer-events-none absolute z-10 m3-card m3-elev rounded-xl px-3 py-2 text-[12px]"
          [style.left.px]="h.x + h.width / 2"
          [style.top.px]="h.topY - 20"
          style="transform: translate(-50%, -100%)"
        >
          <span class="font-semibold">{{ h.label }}: </span>
          <span class="tabular-nums font-semibold">{{ brl(h.value) }}</span>
        </div>
      }
    } @else {
      <div
        class="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-muted-foreground"
      >
        Ainda sem dados neste período
      </div>
    }
  `,
})
export class WaterfallChartComponent implements AfterViewInit, OnDestroy, OnChanges {
  /** Sem nenhum valor diferente de zero não há o que desenhar: mostra o aviso no lugar dos eixos. */
  protected get hasData(): boolean {
    return this.rows.some((r) => r.value !== 0);
  }

  @Input() rows: WaterfallRow[] = [];

  protected readonly padTop = 32;
  protected readonly padBottom = 24;
  protected readonly padLeft = 46;
  protected readonly padRight = 12;

  private el = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  protected size = signal({ w: 600, h: 300 });
  protected hover = signal<ComputedBar | null>(null);

  private computedRows = computed(() => {
    let running = 0;
    return this.rows.map((w) => {
      if (w.kind === 'start') {
        running = w.value;
        return { ...w, base: 0, bar: w.value };
      }
      if (w.kind === 'end') {
        return { ...w, base: 0, bar: w.value };
      }
      const next = running + w.value;
      const row = { ...w, base: next, bar: -w.value };
      running = next;
      return row;
    });
  });

  private maxValue = computed(() => {
    const rows = this.computedRows();
    let max = 0;
    for (const r of rows) {
      max = Math.max(max, r.base + Math.abs(r.bar));
    }
    return niceMax(max);
  });

  protected valueTicks = computed(() => {
    const max = this.maxValue();
    const count = 4;
    const s = this.size();
    const plot = s.h - this.padTop - this.padBottom;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = (max / count) * i;
      const frac = value / (max || 1);
      return { pos: s.h - this.padBottom - frac * plot, label: `${Math.round(value / 1000)}k` };
    });
  });

  protected bars = computed<ComputedBar[]>(() => {
    const rows = this.computedRows();
    const s = this.size();
    const n = rows.length || 1;
    const max = this.maxValue();
    const plotW = s.w - this.padLeft - this.padRight;
    const plotH = s.h - this.padTop - this.padBottom;
    const band = plotW / n;
    const barW = band * 0.6;
    return rows.map((r, i) => {
      const top = r.base + Math.max(r.bar, 0);
      const bottom = r.base + Math.min(r.bar, 0);
      const yTop = max > 0 ? s.h - this.padBottom - (top / max) * plotH : s.h - this.padBottom;
      const yBottom =
        max > 0 ? s.h - this.padBottom - (bottom / max) * plotH : s.h - this.padBottom;
      const x = this.padLeft + band * i + (band - barW) / 2;
      return {
        ...r,
        x,
        y: yTop,
        width: barW,
        height: Math.max(1, yBottom - yTop),
        color:
          r.kind === 'end' ? 'var(--mint)' : r.kind === 'start' ? 'var(--ocean)' : 'var(--warning)',
        topY: yTop,
      };
    });
  });

  protected connectors = computed(() => {
    const bars = this.bars();
    const segs: { x1: number; x2: number; y: number }[] = [];
    for (let i = 0; i < bars.length - 1; i++) {
      segs.push({ x1: bars[i].x + bars[i].width, x2: bars[i + 1].x, y: bars[i].topY });
    }
    return segs;
  });

  protected brl(v: number): string {
    return `${v < 0 ? '−' : ''}R$ ${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        this.size.set({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    });
    this.resizeObserver.observe(this.el.nativeElement);
  }

  ngOnChanges(): void {
    this.hover.set(null);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * base;
}
