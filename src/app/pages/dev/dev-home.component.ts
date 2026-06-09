import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { environment } from '../../../environments/environment';
import { PopupComponent, PopupItem } from '../../popup/popup.component';
import { DevTestComponent } from '../../dev-test/dev-test.component';
import { NavbarComponent, NavItem } from '../../navbar/navbar.component';
import { FinanceShowcaseComponent } from './finance-showcase.component';

type DevPage = 'home' | 'dev-test' | 'components';

/**
 * Showcase do design system (navbar/popup/dev-test + Material).
 * Roteado em /dev — preserva o trabalho anterior da staging sem interferir
 * no app financeiro, que é o app principal.
 */
@Component({
  selector: 'app-dev-home',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    PopupComponent,
    DevTestComponent,
    FinanceShowcaseComponent,
    MatButtonModule,
    MatCardModule,
  ],
  templateUrl: './dev-home.component.html',
  styleUrls: ['./dev-home.component.css'],
})
export class DevHomeComponent {
  protected readonly currentPage = signal<DevPage>('home');
  protected readonly popups = signal<PopupItem[]>([]);
  protected readonly isDev = environment.enableDevTools;
  protected readonly appEnvironment = environment.name;
  protected readonly navbarPosition = signal<'top' | 'lateral'>('top');

  protected readonly navItems: NavItem[] = this.isDev
    ? [
        { label: 'Home', id: 'home' },
        { label: 'Dev-test', id: 'dev-test' },
        { label: 'Componentes', id: 'components' },
      ]
    : [{ label: 'Home', id: 'home' }];

  protected openModal(): void {
    this.popups.set([
      ...this.popups(),
      {
        id: `home-popup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Notificação Mintly',
        message:
          'Sua conta foi atualizada com sucesso. Continue usando Mintly para controlar suas finanças.',
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

  protected setPage(page: DevPage): void {
    if (page !== 'home' && !this.isDev) {
      return;
    }
    this.currentPage.set(page);
  }

  protected handleNav(page: string): void {
    this.setPage(page as DevPage);
  }

  protected toggleNavbarPosition(): void {
    this.navbarPosition.set(this.navbarPosition() === 'top' ? 'lateral' : 'top');
  }
}
