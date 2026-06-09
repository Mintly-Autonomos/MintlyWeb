import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(tone: ToastTone, message: string, duration = 4000): void {
    const id = Date.now() + Math.random();
    this.toasts.update((t) => [...t, { id, tone, message }]);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }

  success(message: string): void {
    this.show('success', message);
  }
  error(message: string): void {
    this.show('error', message);
  }
  info(message: string): void {
    this.show('info', message);
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
