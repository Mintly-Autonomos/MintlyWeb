import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-section-header',
  standalone: true,
  host: { class: 'flex items-end justify-between mb-4 gap-4' },
  template: `
    <div>
      <h2 class="text-[17px] font-bold tracking-tight">{{ title }}</h2>
      @if (description) {
        <p class="text-[13px] text-muted-foreground mt-0.5">{{ description }}</p>
      }
    </div>
    <ng-content select="[slot=action]" />
  `,
})
export class SectionHeaderComponent {
  @Input() title = '';
  @Input() description = '';
}
