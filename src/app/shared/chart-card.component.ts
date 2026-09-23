import { Component, Input } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';

/** Card com título/descrição/ação e área de conteúdo com altura fixa (gráfico ou skeleton de loading). */
@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [SkeletonComponent],
  host: { class: 'block' },
  template: `
    <div class="m3-card rounded-2xl p-5 transition-shadow duration-200 hover:m3-elev">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 class="text-[15px] font-bold tracking-tight inline-flex items-center gap-1.5">
            {{ title }}
            <ng-content select="[slot=title-extra]" />
          </h3>
          @if (description) {
            <p class="text-[12.5px] text-muted-foreground mt-0.5">{{ description }}</p>
          }
        </div>
        <ng-content select="[slot=action]" />
      </div>
      <div [style.height.px]="height" class="w-full">
        @if (loading) {
          <app-skeleton />
        } @else {
          <ng-content />
        }
      </div>
    </div>
  `,
})
export class ChartCardComponent {
  @Input() title = '';
  @Input() description = '';
  @Input() loading = false;
  @Input() height = 300;
}
