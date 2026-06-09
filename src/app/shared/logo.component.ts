import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a [routerLink]="to" class="inline-flex items-center gap-2.5 no-underline">
      <div class="rounded-xl bg-mint grid place-items-center shrink-0" [style.width.px]="size" [style.height.px]="size">
        <span class="material-symbols-outlined text-white" [style.fontSize.px]="size * 0.6">bolt</span>
      </div>
      <div>
        <div class="font-extrabold tracking-tight leading-none text-foreground" [style.fontSize.px]="size * 0.65">Mintly</div>
        @if (tagline) {
          <div class="text-muted-foreground leading-none mt-0.5" [style.fontSize.px]="size * 0.38">{{ tagline }}</div>
        }
      </div>
    </a>
  `,
})
export class LogoComponent {
  @Input() size = 36;
  @Input() tagline = '';
  @Input() to = '/';
}
