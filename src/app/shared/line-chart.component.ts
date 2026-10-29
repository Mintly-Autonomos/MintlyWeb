import {
  Component,
  Input,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';

export interface LineSeries {
  key: string;
  name: string;
  color: string;
}

/** Qualquer objeto de dados; os campos são lidos dinamicamente por `categoryKey`/`series[].key`. */
export type LineChartDatum = unknown;

function field(d: LineChartDatum, key: string): unknown {
  return (d as Record<string, unknown>)[key];
}

interface AxisTick {
  pos: number;
  label: string;
}

/** Gráfico de linhas multi-série (substitui o LineChart do Recharts). Eixo X categórico, Y linear. */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  host: { class: 'block relative w-full h-full' },
  template: `
    @if (hasData) {
      <svg
        [attr.viewBox]="'0 0 ' + size().w + ' ' + size().h"
        class="w-full h-full block"
        (mousemove)="onMove($event)"
        (mouseleave)="hoverIndex.set(null)"
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

        @for (c of categoryTicks(); track c.pos) {
          <text
            [attr.x]="c.pos"
            [attr.y]="size().h - padBottom + 16"
            text-anchor="middle"
            font-size="11.5"
            fill="var(--muted-foreground)"
          >
            {{ c.label }}
          </text>
        }

        @if (hoverIndex(); as hi) {
          <line
            [attr.x1]="categoryTicks()[hi].pos"
            [attr.x2]="categoryTicks()[hi].pos"
            [attr.y1]="padTop"
            [attr.y2]="size().h - padBottom"
            stroke="var(--border)"
          />
        }

        @for (s of linePaths(); track s.key) {
          <path [attr.d]="s.d" fill="none" [attr.stroke]="s.color" stroke-width="2.5" />
          @if (hoverIndex(); as hi) {
            <circle
              [attr.cx]="s.points[hi].x"
              [attr.cy]="s.points[hi].y"
              r="3.5"
              [attr.fill]="s.color"
              stroke="var(--card)"
              stroke-width="1.5"
            />
          }
        }
      </svg>

      @if (hoverIndex(); as hi) {
        <div
          class="pointer-events-none absolute z-10 m3-card m3-elev rounded-xl px-3 py-2 text-[12px] space-y-1"
          [style.left.px]="categoryTicks()[hi].pos"
          [style.top.px]="padTop"
          style="transform: translate(-50%, -100%) translateY(-8px)"
        >
          <div class="font-semibold">{{ categoryTicks()[hi].label }}</div>
          @for (s of series; track s.key) {
            <div class="flex items-center gap-2 tabular-nums">
              <span class="h-2 w-2 rounded-full shrink-0" [style.background]="s.color"></span>
              <span class="text-muted-foreground">{{ s.name }}</span>
              <span class="ml-auto font-semibold whitespace-nowrap">{{
                fmt(valueAt(hi, s.key))
              }}</span>
            </div>
          }
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
export class LineChartComponent implements AfterViewInit, OnDestroy {
  /** Sem nenhum valor diferente de zero não há o que desenhar: mostra o aviso no lugar dos eixos. */
  protected get hasData(): boolean {
    return this.data.some((d) =>
      this.series.some((s) => {
        const raw = field(d, s.key);
        return (
          raw !== null && raw !== undefined && Number(raw) !== 0 && Number.isFinite(Number(raw))
        );
      }),
    );
  }

  @Input() data: LineChartDatum[] = [];
  @Input() categoryKey = '';
  @Input() series: LineSeries[] = [];
  @Input() valueFormatter: (v: number) => string = (v) => String(v);

  protected readonly padTop = 12;
  protected readonly padBottom = 24;
  protected readonly padLeft = 40;
  protected readonly padRight = 16;

  private el = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  protected size = signal({ w: 600, h: 300 });
  protected hoverIndex = signal<number | null>(null);

  private maxValue = computed(() => {
    let max = 0;
    for (const d of this.data) {
      for (const s of this.series) {
        max = Math.max(max, Number(field(d, s.key)) || 0);
      }
    }
    return niceMax(max);
  });

  protected valueTicks = computed<AxisTick[]>(() => {
    const max = this.maxValue();
    const count = 4;
    const s = this.size();
    const plot = s.h - this.padTop - this.padBottom;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = (max / count) * i;
      const frac = value / (max || 1);
      return {
        pos: s.h - this.padBottom - frac * plot,
        label: this.valueFormatter(Math.round(value)),
      };
    });
  });

  protected categoryTicks = computed<AxisTick[]>(() => {
    const s = this.size();
    const n = this.data.length;
    if (n === 0) return [];
    const plot = s.w - this.padLeft - this.padRight;
    const step = n > 1 ? plot / (n - 1) : 0;
    return this.data.map((d, i) => ({
      pos: n > 1 ? this.padLeft + step * i : this.padLeft + plot / 2,
      label: String(field(d, this.categoryKey) ?? ''),
    }));
  });

  protected linePaths = computed(() => {
    const ticks = this.categoryTicks();
    const s = this.size();
    const max = this.maxValue();
    const plotH = s.h - this.padTop - this.padBottom;
    return this.series.map((sr) => {
      const points = this.data.map((d, i) => {
        const value = Number(field(d, sr.key)) || 0;
        const y = max > 0 ? s.h - this.padBottom - (value / max) * plotH : s.h - this.padBottom;
        return { x: ticks[i]?.pos ?? 0, y };
      });
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      return { key: sr.key, color: sr.color, d, points };
    });
  });

  protected fmt(v: number): string {
    return this.valueFormatter(v);
  }

  protected valueAt(index: number, key: string): number {
    return Number(field(this.data[index], key)) || 0;
  }

  onMove(ev: MouseEvent): void {
    const ticks = this.categoryTicks();
    if (!ticks.length) return;
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = this.size().w / rect.width;
    const x = (ev.clientX - rect.left) * scaleX;
    let nearest = 0;
    let best = Infinity;
    ticks.forEach((t, i) => {
      const dist = Math.abs(t.pos - x);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    this.hoverIndex.set(nearest);
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
