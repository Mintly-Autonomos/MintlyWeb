import { Injectable, signal } from '@angular/core';

/**
 * Único sistema de tema do app (claro/escuro via classe `.dark`).
 * A transição de cores é aplicada apenas durante a troca de tema
 * (classe temporária `theme-anim`), evitando custo de paint no uso normal.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(false);
  private animTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const dark = localStorage.getItem('mintly-theme') === 'dark';
    this.isDark.set(dark);
    this._apply(dark);
  }

  toggleTheme(): void {
    const next = !this.isDark();
    this._animateOnce();
    this.isDark.set(next);
    this._apply(next);
    localStorage.setItem('mintly-theme', next ? 'dark' : 'light');
  }

  private _apply(dark: boolean): void {
    document.documentElement.classList.toggle('dark', dark);
  }

  /** Liga a transição de cores só pela duração da troca de tema. */
  private _animateOnce(): void {
    const root = document.documentElement;
    root.classList.add('theme-anim');
    if (this.animTimer) clearTimeout(this.animTimer);
    this.animTimer = setTimeout(() => root.classList.remove('theme-anim'), 240);
  }
}
