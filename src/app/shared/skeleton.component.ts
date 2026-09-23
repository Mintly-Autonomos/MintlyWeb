import { Component } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  host: { class: 'block w-full h-full' },
  template: `<div class="animate-pulse rounded-xl bg-muted w-full h-full"></div>`,
})
export class SkeletonComponent {}
