import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a
      [routerLink]="to"
      aria-label="Mintly — ir para a página inicial"
      class="inline-flex items-center gap-2.5 no-underline"
    >
      <span class="relative inline-flex shrink-0">
        @if (variant === 'gradient') {
          <img
            src="logo/mintly-gradient.svg"
            alt=""
            aria-hidden="true"
            draggable="false"
            class="block select-none w-auto"
            [style.height.px]="size"
          />
        } @else {
          <img
            src="logo/mintly-green.svg"
            alt=""
            aria-hidden="true"
            draggable="false"
            class="block dark:hidden select-none w-auto"
            [style.height.px]="size"
          />
          <img
            src="logo/mintly-white.svg"
            alt=""
            aria-hidden="true"
            draggable="false"
            class="hidden dark:block select-none w-auto"
            [style.height.px]="size"
          />
        }
      </span>
      <div>
        <div
          class="font-extrabold tracking-tight leading-none text-foreground"
          [style.fontSize.px]="size * 0.65"
        >
          Mintly
        </div>
        @if (tagline) {
          <div class="text-muted-foreground leading-none mt-0.5" [style.fontSize.px]="size * 0.38">
            {{ tagline }}
          </div>
        }
      </div>
    </a>
  `,
})
export class LogoComponent {
  @Input() size = 36;
  @Input() tagline = '';
  @Input() to = '/';
  /** `auto`: verde no tema claro e branca no escuro; `gradient`: a mesma em qualquer tema (telas de autenticação). */
  @Input() variant: 'auto' | 'gradient' = 'auto';
}
