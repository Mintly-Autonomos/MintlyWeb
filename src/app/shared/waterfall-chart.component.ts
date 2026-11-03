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
import { chartScale, scaleTicks } from './chart-scale';
import { formatCompact } from './format';

export interface WaterfallRow {
  label: string;
  value: number;
  kind: 'start' | 'down' | 'up' | 'end';
}

/** Faixa de valores que a barra ocupa (`lo`–`hi`) e o total acumulado depois dela (`level`). */
export interface WaterfallSpan {
  lo: number;
  hi: number;
  level: number;
}

/**
 * Início e fim nascem do zero; as etapas flutuam entre o total de antes e o de depois. Com prejuízo o
 * total acumulado cruza o zero, então as faixas podem ficar abaixo dele.
 */
export function waterfallSpans(rows: WaterfallRow[]): WaterfallSpan[] {
  let running = 0;
  return rows.map((r) => {
    if (r.kind === 'start' || r.kind === 'end') {
      if (r.kind === 'start') running = r.value;
      return { lo: Math.min(0, r.value), hi: Math.max(0, r.value), level: r.value };
    }
    const from = running;
    running += r.value;
    return { lo: Math.min(from, running), hi: Math.max(from, running), level: running };
  });
}

interface ComputedBar extends WaterfallRow {
  level: number;
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

        <line
          [attr.x1]="padLeft"
          [attr.x2]="size().w - padRight"
          [attr.y1]="yOf(0)"
          [attr.y2]="yOf(0)"
          stroke="var(--muted-foreground)"
          stroke-opacity="0.5"
        />

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

  private spans = computed(() => waterfallSpans(this.rows));

  /** Eixo vertical: sempre inclui o zero e acompanha o total acumulado, mesmo abaixo dele. */
  private scale = computed(() =>
    chartScale(
      this.spans().flatMap((p) => [p.lo, p.hi]),
      'always',
    ),
  );

  protected yOf(value: number): number {
    const { min, max } = this.scale();
    const plotH = this.size().h - this.padTop - this.padBottom;
    return this.size().h - this.padBottom - ((value - min) / (max - min || 1)) * plotH;
  }

  protected valueTicks = computed(() =>
    scaleTicks(this.scale()).map((v) => ({ pos: this.yOf(v), label: formatCompact(v) })),
  );

  protected bars = computed<ComputedBar[]>(() => {
    const spans = this.spans();
    const s = this.size();
    const n = this.rows.length || 1;
    const plotW = s.w - this.padLeft - this.padRight;
    const band = plotW / n;
    const barW = band * 0.6;
    return this.rows.map((r, i) => {
      const yTop = this.yOf(spans[i].hi);
      const yBottom = this.yOf(spans[i].lo);
      return {
        ...r,
        level: spans[i].level,
        x: this.padLeft + band * i + (band - barW) / 2,
        y: yTop,
        width: barW,
        height: Math.max(1, yBottom - yTop),
        color:
          r.kind === 'end'
            ? r.value < 0
              ? 'var(--error)'
              : 'var(--mint)'
            : r.kind === 'start'
              ? 'var(--ocean)'
              : 'var(--warning)',
        topY: yTop,
      };
    });
  });

  /** Liga o total acumulado ao fim de cada barra com o início da seguinte. */
  protected connectors = computed(() => {
    const bars = this.bars();
    const segs: { x1: number; x2: number; y: number }[] = [];
    for (let i = 0; i < bars.length - 1; i++) {
      segs.push({ x1: bars[i].x + bars[i].width, x2: bars[i + 1].x, y: this.yOf(bars[i].level) });
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
