import { Component, inject } from '@angular/core';
import { IconComponent } from './icon.component';
import { ToastService, ToastTone } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      @for (t of toastSvc.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border border-border bg-card min-w-[300px] animate-in slide-in-from-bottom-4"
        >
          <app-icon
            [name]="toastIcon(t.tone)"
            [style]="{ fontSize: '20px' }"
            [className]="toastColor(t.tone)"
          />
          <span class="text-sm flex-1">{{ t.message }}</span>
          <button
            type="button"
            (click)="toastSvc.dismiss(t.id)"
            class="text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Fechar notificação"
          >
            <app-icon name="close" [style]="{ fontSize: '16px' }" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  protected toastSvc = inject(ToastService);

  toastIcon(tone: ToastTone): string {
    return tone === 'success' ? 'check_circle' : tone === 'error' ? 'error' : 'info';
  }
  toastColor(tone: ToastTone): string {
    return tone === 'success' ? 'text-success' : tone === 'error' ? 'text-error' : 'text-ocean';
  }
}
