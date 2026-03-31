import { Component, isDevMode, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { PopupComponent, PopupItem } from './popup/popup.component';
import { DevTestComponent } from './dev-test/dev-test.component';
import { NavbarComponent, NavItem } from './navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, NavbarComponent, PopupComponent, DevTestComponent, MatButtonModule, MatCardModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App {
  protected readonly currentPage = signal<'home' | 'dev-test'>('home');
  protected readonly popups = signal<PopupItem[]>([]);
  protected readonly isDev = isDevMode();
  protected readonly navbarPosition = signal<'top' | 'lateral'>('top');

  protected readonly navItems: NavItem[] = this.isDev
    ? [
        { label: 'Home', id: 'home' },
        { label: 'Dev-test', id: 'dev-test' },
      ]
    : [{ label: 'Home', id: 'home' }];

  protected openModal(): void {
    this.popups.set([
      ...this.popups(),
      {
        id: `home-popup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Notificação Mintly',
        message: 'Sua conta foi atualizada com sucesso. Continue usando Mintly para controlar suas finanças.',
        status: 'success',
        position: 'top-right',
        duration: 4,
      },
    ]);
  }

  protected closeModal(): void {
    this.popups.set([]);
  }

  protected closePopup(id: string): void {
    this.popups.set(this.popups().filter((popup) => popup.id !== id));
  }

  protected setPage(page: 'home' | 'dev-test'): void {
    if (page === 'dev-test' && !this.isDev) {
      return;
    }
    this.currentPage.set(page);
  }

  protected handleNav(page: string): void {
    this.setPage(page as 'home' | 'dev-test');
  }

  protected toggleNavbarPosition(): void {
    this.navbarPosition.set(this.navbarPosition() === 'top' ? 'lateral' : 'top');
  }
}

