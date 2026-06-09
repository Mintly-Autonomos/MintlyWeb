import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  OnChanges,
  OnDestroy,
} from '@angular/core';
import { IconComponent } from './icon.component';

let modalSeq = 0;

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (open) {
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div
        class="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/30 backdrop-blur-sm"
        (click)="onBackdrop($event)"
      >
        <div
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          [class]="
            'bg-card rounded-3xl border border-border w-full shadow-2xl overflow-hidden ' +
            (size === 'lg' ? 'max-w-3xl' : 'max-w-xl')
          "
        >
          <div class="px-6 pt-6 pb-4 flex items-start justify-between">
            <div>
              <h3 [id]="titleId" class="text-[18px] font-bold tracking-tight">{{ title }}</h3>
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
              <app-icon name="close" [style]="{ fontSize: '20px' }" />
            </button>
          </div>
          <div class="px-6 pb-6 max-h-[70vh] overflow-y-auto">
            <ng-content />
          </div>
          @if (hasFooter) {
            <div
              class="px-6 py-4 border-t border-border bg-muted/40 flex items-center justify-end gap-2"
            >
              <ng-content select="[slot=footer]" />
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ModalComponent implements OnChanges, OnDestroy {
  @Input() open = true;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() size: 'md' | 'lg' = 'md';
  @Input() hasFooter = true;
  @Output() closed = new EventEmitter<void>();

  protected readonly titleId = `modal-title-${modalSeq++}`;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.closed.emit();
  }

  ngOnChanges(): void {
    this.lockScroll(this.open);
  }

  ngOnDestroy(): void {
    this.lockScroll(false);
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  /** Trava o scroll do body enquanto o modal está aberto. */
  private lockScroll(lock: boolean): void {
    document.body.style.overflow = lock ? 'hidden' : '';
  }
}
