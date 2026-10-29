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

export interface BarSeries {
  key: string;
  name: string;
  color: string;
}

/** Qualquer objeto de dados; os campos são lidos dinamicamente por `categoryKey`/`series[].key`. */
export type BarChartDatum = unknown;

function field(d: BarChartDatum, key: string): unknown {
  return (d as Record<string, unknown>)[key];
}

interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  category: string;
  seriesName: string;
  value: number;
}

interface AxisTick {
  pos: number;
  label: string;
}

/**
 * Gráfico de barras genérico (colunas verticais ou barras horizontais), com 1+ séries
 * agrupadas lado a lado. Substitui o BarChart do Recharts usado no base — sem dependência
 * externa, coordenadas do viewBox = pixels reais do container (medidos via ResizeObserver),
 * então o tooltip flutuante pode reusar x/y do retângulo sem conversão.
 */
@Component({
  selector: 'app-bar-chart',
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
          @if (orientation === 'columns') {
            <line
              [attr.x1]="padLeft()"
              [attr.x2]="size().w - padRight"
              [attr.y1]="t.pos"
              [attr.y2]="t.pos"
              stroke="var(--border)"
              stroke-dasharray="3 3"
            />
            <text
              [attr.x]="padLeft() - 8"
              [attr.y]="t.pos"
              text-anchor="end"
              dominant-baseline="middle"
              font-size="11"
              fill="var(--muted-foreground)"
            >
              {{ t.label }}
            </text>
          } @else {
            <line
              [attr.x1]="t.pos"
              [attr.x2]="t.pos"
              [attr.y1]="padTop"
              [attr.y2]="size().h - padBottom()"
              stroke="var(--border)"
              stroke-dasharray="3 3"
            />
          }
        }

        @for (b of bars(); track $index) {
          <rect
            [attr.x]="b.x"
            [attr.y]="b.y"
            [attr.width]="b.width"
            [attr.height]="b.height"
            [attr.fill]="b.color"
            [attr.rx]="radius"
            style="cursor:pointer"
            (mouseenter)="hover.set(b)"
            (mousemove)="hover.set(b)"
          />
        }

        @for (c of categoryTicks(); track c.pos) {
          @if (orientation === 'columns') {
            <text
              [attr.x]="c.pos"
              [attr.y]="size().h - padBottom() + 16"
              text-anchor="middle"
              font-size="11.5"
              fill="var(--muted-foreground)"
            >
              {{ c.label }}
            </text>
          } @else {
            <text
              [attr.x]="padLeft() - 8"
              [attr.y]="c.pos"
              text-anchor="end"
              dominant-baseline="middle"
              font-size="11.5"
              fill="var(--muted-foreground)"
            >
              {{ c.label }}
            </text>
          }
        }
      </svg>

      @if (hover(); as h) {
        <div
          class="pointer-events-none absolute z-10 m3-card m3-elev rounded-xl px-3 py-2 text-[12px] whitespace-nowrap"
          [style.left.px]="h.x + h.width / 2"
          [style.top.px]="h.y"
          style="transform: translate(-50%, -100%) translateY(-8px)"
        >
          <div class="font-semibold mb-0.5">{{ h.category }}</div>
          <div class="tabular-nums text-muted-foreground">
            {{ h.seriesName }}:
            <span class="font-semibold text-foreground">{{ fmt(h.value) }}</span>
          </div>
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
export class BarChartComponent implements AfterViewInit, OnDestroy, OnChanges {
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

  @Input() data: BarChartDatum[] = [];
  @Input() categoryKey = '';
  @Input() series: BarSeries[] = [];
  @Input() orientation: 'columns' | 'bars' = 'columns';
  @Input() valueFormatter: (v: number) => string = (v) => String(v);
  @Input() colorFor: ((datum: BarChartDatum, index: number) => string) | null = null;
  @Input() categoryLabelWidth = 90;

  protected readonly padTop = 16;
  protected readonly radius = 6;
  private el = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  protected size = signal({ w: 600, h: 300 });
  protected hover = signal<BarRect | null>(null);

  protected padLeft = computed(() =>
    this.orientation === 'columns' ? 44 : this.categoryLabelWidth,
  );
  protected padBottom = computed(() => (this.orientation === 'columns' ? 28 : 12));
  protected readonly padRight = 16;

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
    const plot =
      this.orientation === 'columns'
        ? s.h - this.padTop - this.padBottom()
        : s.w - this.padLeft() - this.padRight;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = (max / count) * i;
      const frac = value / (max || 1);
      const pos =
        this.orientation === 'columns'
          ? s.h - this.padBottom() - frac * plot
          : this.padLeft() + frac * plot;
      return { pos, label: this.valueFormatter(Math.round(value)) };
    });
  });

  protected categoryTicks = computed<AxisTick[]>(() => {
    const s = this.size();
    const n = this.data.length || 1;
    const plot =
      this.orientation === 'columns'
        ? s.w - this.padLeft() - this.padRight
        : s.h - this.padTop - this.padBottom();
    const band = plot / n;
    return this.data.map((d, i) => {
      const center =
        this.orientation === 'columns'
          ? this.padLeft() + band * (i + 0.5)
          : this.padTop + band * (i + 0.5);
      return { pos: center, label: String(field(d, this.categoryKey) ?? '') };
    });
  });

  protected bars = computed<BarRect[]>(() => {
    const s = this.size();
    const n = this.data.length || 1;
    const seriesCount = this.series.length || 1;
    const max = this.maxValue();
    const out: BarRect[] = [];

    if (this.orientation === 'columns') {
      const plotW = s.w - this.padLeft() - this.padRight;
      const plotH = s.h - this.padTop - this.padBottom();
      const band = plotW / n;
      const groupW = band * 0.62;
      const barW = groupW / seriesCount;
      this.data.forEach((d, i) => {
        const groupX = this.padLeft() + band * i + (band - groupW) / 2;
        this.series.forEach((sr, si) => {
          const value = Number(field(d, sr.key)) || 0;
          const h = max > 0 ? (value / max) * plotH : 0;
          out.push({
            x: groupX + si * barW,
            y: this.padTop + (plotH - h),
            width: Math.max(1, barW - 2),
            height: h,
            color: this.colorFor ? this.colorFor(d, i) : sr.color,
            category: String(field(d, this.categoryKey) ?? ''),
            seriesName: sr.name,
            value,
          });
        });
      });
    } else {
      const plotW = s.w - this.padLeft() - this.padRight;
      const plotH = s.h - this.padTop - this.padBottom();
      const band = plotH / n;
      const groupH = band * 0.62;
      const barH = groupH / seriesCount;
      this.data.forEach((d, i) => {
        const groupY = this.padTop + band * i + (band - groupH) / 2;
        this.series.forEach((sr, si) => {
          const value = Number(field(d, sr.key)) || 0;
          const w = max > 0 ? (value / max) * plotW : 0;
          out.push({
            x: this.padLeft(),
            y: groupY + si * barH,
            width: w,
            height: Math.max(1, barH - 2),
            color: this.colorFor ? this.colorFor(d, i) : sr.color,
            category: String(field(d, this.categoryKey) ?? ''),
            seriesName: sr.name,
            value,
          });
        });
      });
    }
    return out;
  });

  protected fmt(v: number): string {
    return this.valueFormatter(v);
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
