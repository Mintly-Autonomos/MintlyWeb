import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button [type]="type" [disabled]="disabled" [class]="btnClass" (click)="clicked.emit($event)">
      @if (icon) {
        <span class="material-symbols-outlined" style="font-size:18px">{{ icon }}</span>
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  @Input() variant: 'filled' | 'tonal' | 'outlined' | 'text' | 'danger' = 'filled';
  @Input() icon = '';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() className = '';
  @Output() clicked = new EventEmitter<MouseEvent>();

  get btnClass(): string {
    const base =
      'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full text-sm font-semibold transition cursor-pointer';
    const variants: Record<string, string> = {
      filled: 'bg-mint text-primary-foreground hover:brightness-95 shadow-sm',
      tonal: 'bg-mint-soft text-ocean hover:brightness-95',
      outlined: 'border border-border bg-card hover:bg-muted text-foreground',
      text: 'text-ocean hover:bg-mint-soft',
      danger: 'bg-error text-white hover:brightness-95',
    };
    return `${base} ${variants[this.variant]} ${this.className}`;
  }
}
