import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-chip',
  standalone: true,
  template: `
    <span [class]="chipClass">
      @if (icon) {
        <span class="material-symbols-outlined" style="font-size:14px">{{ icon }}</span>
      }
      @if (label) { {{ label }} } @else { <ng-content /> }
    </span>
  `,
})
export class ChipComponent {
  @Input() tone: 'neutral' | 'mint' | 'ocean' | 'success' | 'warning' | 'error' = 'neutral';
  @Input() icon = '';
  @Input() label = '';

  get chipClass(): string {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border';
    const tones: Record<string, string> = {
      neutral: 'bg-muted text-foreground/80 border-border',
      mint: 'bg-mint-soft text-ocean border-transparent',
      ocean: 'bg-ocean-soft text-ocean border-transparent',
      success: 'bg-mint-soft text-success border-transparent',
      warning: 'bg-warning/10 text-warning border-transparent',
      error: 'bg-error/10 text-error border-transparent',
    };
    return `${base} ${tones[this.tone]}`;
  }
}
