import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { formatBRL } from './format';

export type ScatterShape = 'circle' | 'square' | 'diamond' | 'triangle';

export interface ScatterPoint {
  id: string;
  nome: string;
  categoria: string | null;
  /** Quantidade vendida. */
  x: number;
  /** Margem em %. */
  y: number;
  /** Margem por unidade, em R$ (só para o tooltip). */
  margem: number;
  grupo: string;
  grupoLabel: string;
  cor: string;
  forma: ScatterShape;
}

const M = { top: 18, right: 24, bottom: 44, left: 64 };

/**
 * Dispersão com quatro regiões (quadrantes pelas médias), usada na análise de cardápio.
 * Equivale ao ScatterChart do Recharts do protótipo: regiões coloridas, linhas das médias, formas
 * por grupo, ponto selecionado em destaque e um "fantasma" do preço atual enquanto se simula.
 */
@Component({
  selector: 'app-scatter-chart',
  standalone: true,
  host: { class: 'block relative w-full h-full' },
  template: `
    <div class="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      <span class="absolute top-2 right-6 text-[11px] font-semibold text-muted-foreground"
        >Melhores</span
      >
      <span class="absolute bottom-14 right-6 text-[11px] font-semibold text-muted-foreground"
        >Populares</span
      >
      <span class="absolute top-2 left-[84px] text-[11px] font-semibold text-muted-foreground"
        >Promissores</span
      >
      <span class="absolute bottom-14 left-[84px] text-[11px] font-semibold text-muted-foreground"
        >Fracos</span
      >
    </div>
    <div class="h-full w-full overflow-x-auto">
      <div class="h-full min-w-[520px] relative">
        <svg
          [attr.viewBox]="'0 0 ' + w() + ' ' + h()"
          class="w-full h-full block"
          role="img"
          aria-label="Dispersão: quantidade vendida por margem de cada prato"
        >
          <!-- grade -->
          @for (t of yTicks(); track t.v) {
            <line
              [attr.x1]="M.left"
              [attr.x2]="w() - M.right"
              [attr.y1]="t.pos"
              [attr.y2]="t.pos"
              stroke="var(--border)"
              stroke-dasharray="3 3"
            />
            <text
              [attr.x]="M.left - 8"
              [attr.y]="t.pos + 4"
              text-anchor="end"
              font-size="11"
              fill="var(--muted-foreground)"
            >
              {{ t.label }}
            </text>
          }
          @for (t of xTicks(); track t.v) {
            <line
              [attr.x1]="t.pos"
              [attr.x2]="t.pos"
              [attr.y1]="M.top"
              [attr.y2]="h() - M.bottom"
              stroke="var(--border)"
              stroke-dasharray="3 3"
            />
            <text
              [attr.x]="t.pos"
              [attr.y]="h() - M.bottom + 16"
              text-anchor="middle"
              font-size="11"
              fill="var(--muted-foreground)"
            >
              {{ t.label }}
            </text>
          }

          <!-- regiões -->
          <rect
            [attr.x]="mx()"
            [attr.y]="M.top"
            [attr.width]="w() - M.right - mx()"
            [attr.height]="my() - M.top"
            fill="var(--success)"
            fill-opacity="0.05"
          />
          <rect
            [attr.x]="mx()"
            [attr.y]="my()"
            [attr.width]="w() - M.right - mx()"
            [attr.height]="h() - M.bottom - my()"
            fill="var(--ocean)"
            fill-opacity="0.05"
          />
          <rect
            [attr.x]="M.left"
            [attr.y]="M.top"
            [attr.width]="mx() - M.left"
            [attr.height]="my() - M.top"
            fill="var(--warning)"
            fill-opacity="0.05"
          />
          <rect
            [attr.x]="M.left"
            [attr.y]="my()"
            [attr.width]="mx() - M.left"
            [attr.height]="h() - M.bottom - my()"
            fill="var(--muted-foreground)"
            fill-opacity="0.04"
          />

          <!-- médias -->
          <line
            [attr.x1]="mx()"
            [attr.x2]="mx()"
            [attr.y1]="M.top"
            [attr.y2]="h() - M.bottom"
            stroke="var(--muted-foreground)"
            stroke-dasharray="5 5"
            stroke-opacity="0.6"
          />
          <line
            [attr.x1]="M.left"
            [attr.x2]="w() - M.right"
            [attr.y1]="my()"
            [attr.y2]="my()"
            stroke="var(--muted-foreground)"
            stroke-dasharray="5 5"
            stroke-opacity="0.6"
          />

          <!-- rótulos dos eixos -->
          <text
            [attr.x]="(M.left + w() - M.right) / 2"
            [attr.y]="h() - 6"
            text-anchor="middle"
            font-size="11"
            fill="var(--muted-foreground)"
          >
            Vende pouco → vende muito
          </text>
          <text
            [attr.transform]="'translate(14 ' + (M.top + h() - M.bottom) / 2 + ') rotate(-90)'"
            text-anchor="middle"
            font-size="11"
            fill="var(--muted-foreground)"
          >
            Lucra pouco ↑ lucra bem
          </text>

          <!-- preço atual (fantasma) enquanto se simula -->
          @if (ghost; as g) {
            <circle
              [attr.cx]="px(g.x)"
              [attr.cy]="py(g.y)"
              r="9"
              fill="var(--muted-foreground)"
              fill-opacity="0.18"
              stroke="var(--muted-foreground)"
              stroke-dasharray="3 3"
            >
              <title>Preço atual</title>
            </circle>
          }

          <!-- pratos -->
          @for (p of points; track p.id) {
            <g
              class="cursor-pointer"
              tabindex="0"
              role="button"
              [attr.aria-label]="p.nome + ': ' + p.x + ' vendidos, margem ' + p.y.toFixed(0) + '%'"
              (click)="pointClick.emit(p.id)"
              (keydown.enter)="pointClick.emit(p.id)"
              (mouseenter)="hover.set(p.id)"
              (mouseleave)="hover.set(null)"
              (focus)="hover.set(p.id)"
              (blur)="hover.set(null)"
            >
              @switch (p.forma) {
                @case ('square') {
                  <rect
                    [attr.x]="px(p.x) - 7"
                    [attr.y]="py(p.y) - 7"
                    width="14"
                    height="14"
                    [attr.fill]="p.cor"
                    fill-opacity="0.9"
                    stroke="var(--card)"
                  />
                }
                @case ('diamond') {
                  <rect
                    [attr.x]="px(p.x) - 6"
                    [attr.y]="py(p.y) - 6"
                    width="12"
                    height="12"
                    [attr.transform]="'rotate(45 ' + px(p.x) + ' ' + py(p.y) + ')'"
                    [attr.fill]="p.cor"
                    fill-opacity="0.9"
                    stroke="var(--card)"
                  />
                }
                @case ('triangle') {
                  <polygon
                    [attr.points]="triangle(px(p.x), py(p.y))"
                    [attr.fill]="p.cor"
                    fill-opacity="0.9"
                    stroke="var(--card)"
                  />
                }
                @default {
                  <circle
                    [attr.cx]="px(p.x)"
                    [attr.cy]="py(p.y)"
                    r="8"
                    [attr.fill]="p.cor"
                    fill-opacity="0.9"
                    stroke="var(--card)"
                  />
                }
              }
              @if (p.id === selectedId) {
                <circle
                  [attr.cx]="px(p.x)"
                  [attr.cy]="py(p.y)"
                  r="13"
                  fill="none"
                  stroke="var(--ocean)"
                  stroke-width="2"
                />
              }
            </g>
          }
        </svg>

        @if (tip(); as t) {
          <div
            class="m3-card m3-elev rounded-xl px-3 py-2 text-[12px] max-w-[240px] pointer-events-none absolute z-20"
            [style.left.px]="t.left"
            [style.top.px]="t.top"
          >
            <div class="font-semibold">{{ t.p.nome }}</div>
            @if (t.p.categoria) {
              <div class="text-muted-foreground">{{ t.p.categoria }}</div>
            }
            <div class="mt-1 tabular-nums">
              {{ t.p.x }} vendidos · {{ fmtBRL(t.p.margem) }} de lucro por unidade ({{
                t.p.y.toFixed(0)
              }}%)
            </div>
            <div class="mt-1 font-semibold">{{ t.p.grupoLabel }}</div>
          </div>
        }
      </div>
    </div>
  `,
})
export class ScatterChartComponent implements OnInit, OnDestroy {
  @Input() points: ScatterPoint[] = [];
  @Input() ghost: { x: number; y: number } | null = null;
  @Input() selectedId: string | null = null;
  @Input() mediaX = 0;
  @Input() mediaY = 0;
  @Input() xMax = 1;
  @Input() yMin = 0;
  @Input() yMax = 100;
  @Output() pointClick = new EventEmitter<string>();

  protected readonly M = M;
  protected readonly fmtBRL = formatBRL;
  protected hover = signal<string | null>(null);
  protected size = signal({ w: 720, h: 520 });
  protected w = computed(() => this.size().w);
  protected h = computed(() => this.size().h);

  private el = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  ngOnInit(): void {
    const host = this.el.nativeElement as HTMLElement;
    const measure = () => {
      const r = host.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        this.size.set({ w: Math.max(520, Math.round(r.width)), h: Math.round(r.height) });
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(measure);
      this.resizeObserver.observe(host);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  px(x: number): number {
    const span = this.xMax || 1;
    return M.left + (x / span) * (this.w() - M.left - M.right);
  }

  py(y: number): number {
    const span = this.yMax - this.yMin || 1;
    return this.h() - M.bottom - ((y - this.yMin) / span) * (this.h() - M.top - M.bottom);
  }

  // Métodos (não computed): dependem dos @Input, que não são signals.
  protected mx(): number {
    return this.px(this.mediaX);
  }
  protected my(): number {
    return this.py(this.mediaY);
  }

  protected triangle(cx: number, cy: number): string {
    return `${cx},${cy - 8} ${cx + 8},${cy + 7} ${cx - 8},${cy + 7}`;
  }

  protected xTicks(): { v: number; pos: number; label: string }[] {
    return [0, 1, 2, 3, 4].map((i) => {
      const v = (this.xMax * i) / 4;
      return { v, pos: this.px(v), label: String(Math.round(v)) };
    });
  }

  protected yTicks(): { v: number; pos: number; label: string }[] {
    return [0, 1, 2, 3, 4].map((i) => {
      const v = this.yMin + ((this.yMax - this.yMin) * i) / 4;
      return { v, pos: this.py(v), label: `${Math.round(v)}%` };
    });
  }

  protected tip(): { p: ScatterPoint; left: number; top: number } | null {
    const id = this.hover();
    const p = id ? this.points.find((x) => x.id === id) : undefined;
    if (!p) return null;
    const left = Math.min(Math.max(8, this.px(p.x) + 14), this.w() - 250);
    const top = Math.max(8, this.py(p.y) - 70);
    return { p, left, top };
  }
}
