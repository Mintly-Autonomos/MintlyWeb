import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (open) {
      <div
        class="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/30 backdrop-blur-sm"
        (click)="onBackdrop()"
      >
        <div
          (click)="$event.stopPropagation()"
          [class]="'bg-card rounded-3xl border border-border w-full shadow-2xl overflow-hidden ' + (size === 'lg' ? 'max-w-3xl' : 'max-w-xl')"
        >
          <div class="px-6 pt-6 pb-4 flex items-start justify-between">
            <div>
              <h3 class="text-[18px] font-bold tracking-tight">{{ title }}</h3>
              @if (subtitle) {
                <p class="text-[13px] text-muted-foreground mt-1">{{ subtitle }}</p>
              }
            </div>
            <button
              type="button"
              (click)="closed.emit()"
              class="h-9 w-9 rounded-full hover:bg-muted grid place-items-center text-muted-foreground cursor-pointer"
              aria-label="Fechar"
            >
              <app-icon name="close" [style]="{fontSize:'20px'}" />
            </button>
          </div>
          <div class="px-6 pb-6 max-h-[70vh] overflow-y-auto">
            <ng-content />
          </div>
          @if (hasFooter) {
            <div class="px-6 py-4 border-t border-border bg-muted/40 flex items-center justify-end gap-2">
              <ng-content select="[slot=footer]" />
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  @Input() open = true;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() size: 'md' | 'lg' = 'md';
  @Input() hasFooter = true;
  @Output() closed = new EventEmitter<void>();

  onBackdrop(): void { this.closed.emit(); }
}
