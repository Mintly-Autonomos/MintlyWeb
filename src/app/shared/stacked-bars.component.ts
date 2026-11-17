import { Component, Input, computed, signal } from '@angular/core';
import { chartScale, scaleTicks } from './chart-scale';

export interface StackedSeries {
  key: string;
  name: string;
  color: string;
}

/**
 * Colunas empilhadas (uma por categoria do eixo), com o eixo sempre começando no zero. Feito para "quanto cada
 * grupo pesou em cada mês" (Custos, P.9). Leve: HTML e CSS, sem SVG.
 */
@Component({
  selector: 'app-stacked-bars',
  standalone: true,
  template: `
    <div class="h-full flex flex-col">
      <div class="relative flex-1 min-h-0 flex gap-2 pl-11">
        <!-- eixo e grade -->
        @for (t of ticks(); track t) {
          <div class="absolute left-0 right-0 flex items-center gap-2" [style.bottom.%]="pos(t)">
            <span
              class="w-9 text-right text-[11px] text-muted-foreground tabular-nums -translate-y-1/2"
            >
              {{ fmt(t) }}
            </span>
            <span class="flex-1 border-t border-dashed border-border"></span>
          </div>
        }
        @for (row of linhas(); track row.label; let i = $index) {
          <div class="relative flex-1 min-w-0 flex flex-col justify-end items-center z-[1]">
            <span
              class="text-[11px] font-semibold tabular-nums mb-1"
              [attr.data-testid]="'total-' + i"
              >{{ fmt(row.total) }}</span
            >
            <div
              class="w-full max-w-[56px] flex flex-col-reverse rounded-md overflow-hidden"
              [style.height.%]="pos(row.total)"
              [title]="row.titulo"
              role="img"
              [attr.aria-label]="row.titulo"
            >
              @for (seg of row.segs; track seg.key) {
                <div [style.height.%]="seg.pct" [style.background]="seg.color"></div>
              }
            </div>
          </div>
        }
      </div>
      <div class="flex gap-2 pl-11 mt-1.5">
        @for (row of linhas(); track row.label) {
          <span class="flex-1 min-w-0 text-center text-[11.5px] text-muted-foreground truncate">{{
            row.label
          }}</span>
        }
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px]">
        @for (s of series; track s.key) {
          <li class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-sm" [style.background]="s.color"></span>{{ s.name }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class StackedBarsComponent {
  private readonly dados = signal<Record<string, unknown>[]>([]);
  @Input() set data(v: Record<string, unknown>[]) {
    this.dados.set(v ?? []);
  }
  @Input() categoryKey = 'mes';
  @Input() series: StackedSeries[] = [];
  @Input() valueFormatter: (v: number) => string = (v) => String(v);

  protected linhas = computed(() =>
    this.dados().map((d) => {
      const vals = this.series.map((s) => ({ ...s, v: Math.max(0, Number(d[s.key]) || 0) }));
      const total = vals.reduce((a, s) => a + s.v, 0);
      const label = String(d[this.categoryKey] ?? '');
      return {
        label,
        total,
        segs: vals
          .filter((s) => s.v > 0)
          .map((s) => ({ key: s.key, color: s.color, pct: (s.v / total) * 100 })),
        titulo: `${label}: ${vals
          .filter((s) => s.v > 0)
          .map((s) => `${s.name} ${this.valueFormatter(s.v)}`)
          .join(', ')} (total ${this.valueFormatter(total)})`,
      };
    }),
  );

  private escala = computed(() => chartScale([0, ...this.linhas().map((l) => l.total)], 'always'));
  protected ticks = computed(() => scaleTicks(this.escala()));

  protected pos(v: number): number {
    const { min, max } = this.escala();
    return max > min ? ((v - min) / (max - min)) * 100 : 0;
  }

  protected fmt(v: number): string {
    return this.valueFormatter(v);
  }
}
