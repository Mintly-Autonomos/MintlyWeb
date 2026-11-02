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
import { chartScale, fitLabel, roundTo, scaleTicks } from './chart-scale';

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

/** Número escrito ao lado da barra horizontal (sem precisar passar o mouse para saber o valor). */
interface BarLabel {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'end';
  /** Sem espaço fora da barra: o número vai por dentro, em cor clara. */
  inside: boolean;
}

interface AxisTick {
  pos: number;
  label: string;
  /** Texto inteiro (o `label` pode vir cortado com reticências para caber). */
  full?: string;
}

const LABEL_FONT = 11.5;
/** Largura média de uma letra, para saber se o número cabe do lado de fora da barra. */
const CHAR_PX = 6.6;

/**
 * Gráfico de barras genérico (colunas verticais ou barras horizontais), com 1+ séries
 * agrupadas lado a lado. Substitui o BarChart do Recharts usado no base — sem dependência
 * externa, coordenadas do viewBox = pixels reais do container (medidos via ResizeObserver),
 * então o tooltip flutuante pode reusar x/y do retângulo sem conversão.
 *
 * O eixo sempre contém o zero e aceita valores negativos (a barra nasce do zero para baixo/esquerda).
 * Nomes de categoria longos são cortados com reticências (o nome inteiro fica no tooltip); nas barras
 * horizontais o valor aparece escrito ao fim de cada barra.
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
            <text
              [attr.x]="t.pos"
              [attr.y]="size().h - padBottom() + 16"
              text-anchor="middle"
              font-size="11"
              fill="var(--muted-foreground)"
            >
              {{ t.label }}
            </text>
          }
        }

        @if (zeroLine(); as z) {
          <line
            [attr.x1]="z.x1"
            [attr.x2]="z.x2"
            [attr.y1]="z.y1"
            [attr.y2]="z.y2"
            stroke="var(--muted-foreground)"
            stroke-width="1"
          />
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

        @for (l of barLabels(); track $index) {
          <text
            [attr.x]="l.x"
            [attr.y]="l.y"
            [attr.text-anchor]="l.anchor"
            dominant-baseline="middle"
            font-size="11.5"
            font-weight="600"
            class="tabular-nums"
            [attr.fill]="l.inside ? '#fff' : 'var(--foreground)'"
            pointer-events="none"
          >
            {{ l.text }}
          </text>
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
              <title>{{ c.full }}</title>
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
              <title>{{ c.full }}</title>
              {{ c.label }}
            </text>
          }
        }
      </svg>

      @if (hover(); as h) {
        <div
          class="pointer-events-none absolute z-10 m3-card m3-elev rounded-xl px-3 py-2 text-[12px] max-w-[min(320px,90%)]"
          [style.left.px]="tooltipLeft(h)"
          [style.top.px]="h.y"
          style="transform: translate(-50%, -100%) translateY(-8px)"
        >
          <div class="font-semibold mb-0.5 break-words">{{ h.category }}</div>
          <div class="tabular-nums text-muted-foreground whitespace-nowrap">
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
  /** Texto do valor no tooltip (ex.: R$ exato); sem ele vale o `valueFormatter`, que no eixo costuma ser curto ("1,2k"). */
  @Input() tooltipFormatter: ((v: number) => string) | null = null;
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
  /** Nas barras horizontais a faixa de baixo guarda os valores do eixo. */
  protected padBottom = computed(() => 28);
  protected readonly padRight = 16;

  private scale = computed(() => {
    const values: number[] = [];
    for (const d of this.data) {
      for (const s of this.series) values.push(Number(field(d, s.key)) || 0);
    }
    return chartScale(values, 'always');
  });

  /** Área de desenho, nunca negativa (tela estreita não pode inverter as barras). */
  private plot = computed(() => {
    const s = this.size();
    return {
      w: Math.max(0, s.w - this.padLeft() - this.padRight),
      h: Math.max(0, s.h - this.padTop - this.padBottom()),
    };
  });

  /** Posição de um valor ao longo do eixo (y nas colunas, x nas barras horizontais). */
  private posOf(value: number): number {
    const { min, max } = this.scale();
    const frac = (value - min) / (max - min || 1);
    const s = this.size();
    return this.orientation === 'columns'
      ? s.h - this.padBottom() - frac * this.plot().h
      : this.padLeft() + frac * this.plot().w;
  }

  protected valueTicks = computed<AxisTick[]>(() => {
    const scale = this.scale();
    return scaleTicks(scale).map((value) => ({
      pos: this.posOf(value),
      label: this.valueFormatter(roundTo(value, scale.step)),
    }));
  });

  /** Linha do zero, só quando há valor negativo (sem ele o zero já é a borda do gráfico). */
  protected zeroLine = computed(() => {
    if (this.scale().min >= 0) return null;
    const p = this.posOf(0);
    const s = this.size();
    return this.orientation === 'columns'
      ? { x1: this.padLeft(), x2: s.w - this.padRight, y1: p, y2: p }
      : { x1: p, x2: p, y1: this.padTop, y2: s.h - this.padBottom() };
  });

  protected categoryTicks = computed<AxisTick[]>(() => {
    const n = this.data.length || 1;
    const plot = this.orientation === 'columns' ? this.plot().w : this.plot().h;
    const band = plot / n;
    const maxPx =
      this.orientation === 'columns' ? Math.max(24, band - 4) : Math.max(24, this.padLeft() - 12);
    return this.data.map((d, i) => {
      const full = String(field(d, this.categoryKey) ?? '');
      const center =
        this.orientation === 'columns'
          ? this.padLeft() + band * (i + 0.5)
          : this.padTop + band * (i + 0.5);
      return { pos: center, label: fitLabel(full, maxPx, LABEL_FONT), full };
    });
  });

  protected bars = computed<BarRect[]>(() => {
    const n = this.data.length || 1;
    const seriesCount = this.series.length || 1;
    const zero = this.posOf(0);
    const plot = this.plot();
    const out: BarRect[] = [];

    this.data.forEach((d, i) => {
      this.series.forEach((sr, si) => {
        const value = Number(field(d, sr.key)) || 0;
        const color = this.colorFor ? this.colorFor(d, i) : sr.color;
        const category = String(field(d, this.categoryKey) ?? '');
        const end = this.posOf(value);
        // Valor diferente de zero sempre deixa uma marca (uma barra minúscula não some).
        const length = value === 0 ? 0 : Math.max(2, Math.abs(end - zero));
        // Positivo cresce para cima/direita a partir do zero; negativo, para baixo/esquerda.
        const start =
          this.orientation === 'columns'
            ? value >= 0
              ? zero - length
              : zero
            : value >= 0
              ? zero
              : zero - length;

        if (this.orientation === 'columns') {
          const band = plot.w / n;
          const groupW = band * 0.62;
          const barW = groupW / seriesCount;
          const groupX = this.padLeft() + band * i + (band - groupW) / 2;
          out.push({
            x: groupX + si * barW,
            y: start,
            width: Math.max(1, barW - 2),
            height: length,
            color,
            category,
            seriesName: sr.name,
            value,
          });
        } else {
          const band = plot.h / n;
          const groupH = band * 0.62;
          const barH = groupH / seriesCount;
          const groupY = this.padTop + band * i + (band - groupH) / 2;
          out.push({
            x: start,
            y: groupY + si * barH,
            width: length,
            height: Math.max(1, barH - 2),
            color,
            category,
            seriesName: sr.name,
            value,
          });
        }
      });
    });
    return out;
  });

  /** Valores escritos ao fim das barras horizontais (nas colunas o eixo já mostra a escala). */
  protected barLabels = computed<BarLabel[]>(() => {
    if (this.orientation !== 'bars') return [];
    const right = this.size().w - 4;
    const left = this.padLeft() + 4;
    return this.bars()
      .filter((b) => b.value !== 0)
      .map((b) => {
        const text = this.valueFormatter(b.value);
        const textW = text.length * CHAR_PX;
        const y = b.y + b.height / 2;
        if (b.value > 0) {
          const end = b.x + b.width;
          return end + 6 + textW <= right
            ? { x: end + 6, y, text, anchor: 'start' as const, inside: false }
            : { x: end - 6, y, text, anchor: 'end' as const, inside: true };
        }
        return b.x - 6 - textW >= left
          ? { x: b.x - 6, y, text, anchor: 'end' as const, inside: false }
          : { x: b.x + 6, y, text, anchor: 'start' as const, inside: true };
      });
  });

  protected fmt(v: number): string {
    return (this.tooltipFormatter ?? this.valueFormatter)(v);
  }

  /** O tooltip é centrado na barra, mas não pode sair pelas laterais do gráfico. */
  protected tooltipLeft(b: BarRect): number {
    const half = Math.min(160, this.size().w * 0.45);
    return Math.min(Math.max(b.x + b.width / 2, half), this.size().w - half);
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
