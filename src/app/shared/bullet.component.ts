import { Component, Input } from '@angular/core';

/** Barra de meta: faixa alvo (min–max) em verde-suave + valor atual em âmbar. */
@Component({
  selector: 'app-bullet',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div>
      <div class="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          class="absolute inset-y-0 bg-mint-soft"
          [style.left.%]="rangeLeft"
          [style.width.%]="rangeWidth"
        ></div>
        <div
          class="absolute inset-y-0 left-0 rounded-full bg-warning/70"
          [style.width.%]="valueWidth"
        ></div>
      </div>
      <div class="mt-1.5 text-[11px] text-muted-foreground">{{ label }}</div>
    </div>
  `,
})
export class BulletComponent {
  @Input() value = 0;
  @Input() min = 0;
  @Input() max = 100;
  @Input() label = '';

  private get scale(): number {
    return Math.max(this.max * 1.35, this.value * 1.15) || 1;
  }

  get rangeLeft(): number {
    return (this.min / this.scale) * 100;
  }

  get rangeWidth(): number {
    return ((this.max - this.min) / this.scale) * 100;
  }

  get valueWidth(): number {
    return Math.min(100, (this.value / this.scale) * 100);
  }
}
