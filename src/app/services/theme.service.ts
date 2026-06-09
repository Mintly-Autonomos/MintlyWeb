import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem('mintly-theme');
    const dark = saved === 'dark';
    this.isDark.set(dark);
    this._apply(dark);
  }

  toggleTheme(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    this._apply(next);
    localStorage.setItem('mintly-theme', next ? 'dark' : 'light');
  }

  private _apply(dark: boolean): void {
    document.documentElement.classList.toggle('dark', dark);
  }
}
