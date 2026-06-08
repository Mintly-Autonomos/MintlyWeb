import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="text-center py-14 px-6">
      <div class="mx-auto h-16 w-16 rounded-2xl bg-mint-soft text-ocean grid place-items-center mb-4">
        <app-icon [name]="icon" [style]="{fontSize:'30px'}" />
      </div>
      <div class="font-semibold text-[15px]">{{ title }}</div>
      <p class="text-[13px] text-muted-foreground max-w-sm mx-auto mt-1.5">{{ description }}</p>
      @if (hasAction) {
        <div class="mt-5">
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = '';
  @Input() title = '';
  @Input() description = '';
  @Input() hasAction = false;
}
