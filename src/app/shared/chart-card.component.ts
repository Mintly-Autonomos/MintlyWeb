import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';
import { SkeletonComponent } from './skeleton.component';

/** Card com título/descrição/ação e área de conteúdo com altura fixa (gráfico ou skeleton de loading). */
@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [SkeletonComponent, IconComponent],
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
        } @else if (empty) {
          <!-- Estado vazio: explica o que o gráfico mostra e oferece o atalho que gera os dados -->
          <div class="h-full grid place-items-center text-center px-4" data-testid="grafico-vazio">
            <div>
              <div
                class="mx-auto h-14 w-14 rounded-2xl bg-mint-soft text-ocean grid place-items-center mb-3"
              >
                <app-icon [name]="emptyIcon || 'monitoring'" [style]="{ fontSize: '28px' }" />
              </div>
              <div class="font-semibold text-[15px]">{{ emptyTitle }}</div>
              <p class="text-[13px] text-muted-foreground max-w-sm mx-auto mt-1.5">
                {{ emptyDescription }}
              </p>
              <div class="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <ng-content select="[slot=empty-action]" />
              </div>
            </div>
          </div>
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
  /** Sem dados para o gráfico: mostra o estado vazio (ícone, título, texto e a ação de `[slot=empty-action]`). */
  @Input() empty = false;
  @Input() emptyIcon = '';
  @Input() emptyTitle = '';
  @Input() emptyDescription = '';
}
