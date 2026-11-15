import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}
export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(tone: ToastTone, message: string, duration = 4000, action?: ToastAction): void {
    const id = Date.now() + Math.random();
    this.toasts.update((t) => [...t, { id, tone, message, ...(action ? { action } : {}) }]);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }

  success(message: string): void {
    this.show('success', message);
  }
  /** Sucesso com um botão (ex.: "Desfazer"); fica mais tempo na tela para dar tempo de clicar. */
  successWithAction(message: string, action: ToastAction): void {
    this.show('success', message, 8000, action);
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
