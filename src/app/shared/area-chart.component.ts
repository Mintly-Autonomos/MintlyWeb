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

export interface AreaSeries {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
  fill?: boolean;
}

export interface AreaDot {
  /** Rótulo da categoria (eixo X) onde o ponto fica. */
  atLabel: string;
  key: string;
  color: string;
  caption?: string;
}

export type AreaChartDatum = unknown;

function field(d: AreaChartDatum, key: string): unknown {
  return (d as Record<string, unknown>)[key];
}

interface AxisTick {
  pos: number;
  label: string;
}

/**
 * Gráfico de área/linha com suporte a segmento tracejado (projeção), preenchimento em
 * degradê, linha de referência em y=0 e "pins" de referência com legenda (hoje, menor saldo…).
 * Substitui o AreaChart do Recharts usado no Fluxo de Caixa / Previsões.
 */
@Component({
  selector: 'app-area-chart',
  standalone: true,
  host: { class: 'block relative w-full h-full' },
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + size().w + ' ' + size().h"
      class="w-full h-full block"
      (mousemove)="onMove($event)"
      (mouseleave)="hoverIndex.set(null)"
    >
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--ocean)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--ocean)" stop-opacity="0.02" />
        </linearGradient>
      </defs>

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

      @if (zeroLine) {
        <line
          [attr.x1]="padLeft"
          [attr.x2]="size().w - padRight"
          [attr.y1]="yOf(0)"
          [attr.y2]="yOf(0)"
          stroke="var(--error)"
          stroke-width="1.5"
        />
      }

      @if (todayTick(); as tt) {
        <line
          [attr.x1]="tt.pos"
          [attr.x2]="tt.pos"
          [attr.y1]="padTop"
          [attr.y2]="size().h - padBottom"
          stroke="var(--muted-foreground)"
          stroke-dasharray="2 3"
        />
        <text
          [attr.x]="tt.pos + 4"
          [attr.y]="padTop + 10"
          font-size="11"
          fill="var(--muted-foreground)"
        >
          hoje
        </text>
      }

      @for (c of categoryTicks(); track $index) {
        @if (showLabel($index)) {
          <text
            [attr.x]="c.pos"
            [attr.y]="size().h - padBottom + 16"
            text-anchor="middle"
            font-size="11"
            fill="var(--muted-foreground)"
          >
            {{ c.label }}
          </text>
        }
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

      @for (s of areaPaths(); track s.key) {
        @if (s.fillD) {
          <path [attr.d]="s.fillD" fill="url(#areaFill)" stroke="none" />
        }
        <path
          [attr.d]="s.lineD"
          fill="none"
          [attr.stroke]="s.color"
          stroke-width="2.5"
          [attr.stroke-dasharray]="s.dashed ? '6 5' : null"
        />
      }

      @for (dot of dotPositions(); track dot.key) {
        <circle
          [attr.cx]="dot.x"
          [attr.cy]="dot.y"
          r="4.5"
          [attr.fill]="dot.color"
          stroke="var(--card)"
          stroke-width="2"
        />
        @if (dot.caption) {
          <text
            [attr.x]="dot.x"
            [attr.y]="dot.y - 12"
            text-anchor="middle"
            font-size="10.5"
            font-weight="700"
            [attr.fill]="dot.color"
          >
            {{ dot.caption }}
          </text>
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
          @if (hasValue(hi, s.key)) {
            <div class="flex items-center gap-2 tabular-nums">
              <span class="h-2 w-2 rounded-full shrink-0" [style.background]="s.color"></span>
              <span class="text-muted-foreground">{{ s.name }}</span>
              <span class="ml-auto font-semibold whitespace-nowrap">{{
                fmt(valueAt(hi, s.key))
              }}</span>
            </div>
          }
        }
      </div>
    }
  `,
})
export class AreaChartComponent implements AfterViewInit, OnDestroy {
  @Input() data: AreaChartDatum[] = [];
  @Input() categoryKey = '';
  @Input() series: AreaSeries[] = [];
  @Input() valueFormatter: (v: number) => string = (v) => String(v);
  @Input() zeroLine = false;
  @Input() todayLabel = '';
  @Input() dots: AreaDot[] = [];

  protected readonly padTop = 24;
  protected readonly padBottom = 22;
  protected readonly padLeft = 46;
  protected readonly padRight = 16;

  private el = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  protected size = signal({ w: 600, h: 300 });
  protected hoverIndex = signal<number | null>(null);

  private domain = computed(() => {
    let min = 0;
    let max = 0;
    for (const d of this.data) {
      for (const s of this.series) {
        const raw = field(d, s.key);
        if (raw === null || raw === undefined) continue;
        const v = Number(raw);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (min === max) max = min + 1;
    return niceDomain(min, max);
  });

  protected valueTicks = computed<AxisTick[]>(() => {
    const [dMin, dMax] = this.domain();
    const count = 4;
    const s = this.size();
    const plot = s.h - this.padTop - this.padBottom;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = dMin + ((dMax - dMin) / count) * i;
      const frac = (value - dMin) / (dMax - dMin || 1);
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

  protected todayTick = computed<AxisTick | undefined>(() => {
    if (!this.todayLabel) return undefined;
    return this.categoryTicks().find((t) => t.label === this.todayLabel);
  });

  showLabel(index: number): boolean {
    const n = this.data.length || 1;
    const step = Math.max(1, Math.round(n / 8));
    return index % step === 0 || index === n - 1;
  }

  yOf(value: number): number {
    const [dMin, dMax] = this.domain();
    const s = this.size();
    const plot = s.h - this.padTop - this.padBottom;
    const frac = (value - dMin) / (dMax - dMin || 1);
    return s.h - this.padBottom - frac * plot;
  }

  protected areaPaths = computed(() => {
    const ticks = this.categoryTicks();
    const s = this.size();
    return this.series.map((sr) => {
      const segments: { x: number; y: number }[][] = [];
      let current: { x: number; y: number }[] = [];
      this.data.forEach((d, i) => {
        const raw = field(d, sr.key);
        if (raw === null || raw === undefined) {
          if (current.length) segments.push(current);
          current = [];
          return;
        }
        current.push({ x: ticks[i]?.pos ?? 0, y: this.yOf(Number(raw)) });
      });
      if (current.length) segments.push(current);

      const lineD = segments
        .map((seg) => seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '))
        .join(' ');

      let fillD: string | null = null;
      if (sr.fill && segments.length) {
        const baseline = s.h - this.padBottom;
        fillD = segments
          .map((seg) => {
            const top = seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
            const last = seg[seg.length - 1];
            const first = seg[0];
            return `${top} L${last.x},${baseline} L${first.x},${baseline} Z`;
          })
          .join(' ');
      }

      return { key: sr.key, color: sr.color, dashed: !!sr.dashed, lineD, fillD };
    });
  });

  protected dotPositions = computed(() => {
    const ticks = this.categoryTicks();
    return this.dots
      .map((dot) => {
        const idx = this.data.findIndex(
          (d) => String(field(d, this.categoryKey) ?? '') === dot.atLabel,
        );
        if (idx < 0) return null;
        const raw = field(this.data[idx], dot.key);
        if (raw === null || raw === undefined) return null;
        return {
          key: `${dot.atLabel}-${dot.key}`,
          x: ticks[idx]?.pos ?? 0,
          y: this.yOf(Number(raw)),
          color: dot.color,
          caption: dot.caption,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  });

  protected fmt(v: number): string {
    return this.valueFormatter(v);
  }

  protected hasValue(index: number, key: string): boolean {
    const raw = field(this.data[index], key);
    return raw !== null && raw !== undefined;
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

function niceDomain(min: number, max: number): [number, number] {
  const pad = (max - min) * 0.08 || 1;
  return [Math.floor((min - pad) / 100) * 100, Math.ceil((max + pad) / 100) * 100];
}
