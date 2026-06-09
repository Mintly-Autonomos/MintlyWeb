import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { ThemeService } from '../services/theme.service';
import { AuthService } from '../services/auth.service';
import { LogoComponent } from '../shared/logo.component';
import { IconComponent } from '../shared/icon.component';

const NAV = [
  { to: '/movimentacoes', label: 'Movimentações', icon: 'swap_horiz' },
  { to: '/', label: 'Contas Financeiras', icon: 'account_balance' },
  { to: '/categorias', label: 'Categorias', icon: 'category' },
] as const;

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, IconComponent],
  template: `
    <div class="min-h-screen w-full flex bg-background text-foreground">
      <!-- Sidebar -->
      <aside
        class="w-[260px] shrink-0 hidden md:flex flex-col border-r border-border bg-sidebar sticky top-0 h-screen"
      >
        <div class="px-6 py-5">
          <app-logo [size]="30" tagline="Gestão para o seu negócio" to="/" />
        </div>

        <div
          class="px-3 mt-2 mb-1 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold"
        >
          Menu
        </div>

        <nav class="px-2 flex-1 space-y-1">
          @for (item of navItems; track item.to) {
            <a
              [routerLink]="item.to"
              routerLinkActive="bg-mint-soft text-ocean"
              [routerLinkActiveOptions]="{ exact: item.to === '/' }"
              #rla="routerLinkActive"
              class="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-foreground/75 hover:bg-muted hover:text-foreground"
            >
              <span
                [class]="
                  'material-symbols-outlined ' +
                  (rla.isActive ? 'text-mint' : 'text-muted-foreground')
                "
                [style.fontSize]="'20px'"
                [style.fontVariationSettings]="fillVar(rla.isActive)"
                >{{ item.icon }}</span
              >
              <span>{{ item.label }}</span>
              @if (rla.isActive) {
                <span class="ml-auto h-1.5 w-1.5 rounded-full bg-mint"></span>
              }
            </a>
          }
        </nav>

        <div class="m-3 p-4 rounded-2xl bg-mint-soft border border-border">
          <div class="flex items-center gap-2 text-ocean">
            <app-icon name="verified_user" [style]="{ fontSize: '18px' }" />
            <div class="text-sm font-semibold">Suas contas, seguras</div>
          </div>
          <p class="text-xs text-foreground/70 mt-1.5 leading-relaxed">
            Centralize bancos, caixas e plataformas em um só lugar para ter visão real do seu
            dinheiro.
          </p>
        </div>
      </aside>

      <!-- Main -->
      <div class="flex-1 min-w-0 flex flex-col">
        <header
          class="sticky top-0 z-20 h-[68px] border-b border-border bg-background/85 backdrop-blur flex items-center px-6 md:px-10 gap-4"
        >
          <div class="min-w-0">
            <h1 class="text-[20px] md:text-[22px] font-bold tracking-tight truncate">
              {{ pageTitle }}
            </h1>
            <p class="text-[13px] text-muted-foreground truncate">{{ pageSub }}</p>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <div
              class="hidden lg:flex items-center gap-2 h-10 px-3 rounded-full border border-border bg-card w-[280px]"
            >
              <app-icon
                name="search"
                className="text-muted-foreground"
                [style]="{ fontSize: '18px' }"
              />
              <input
                placeholder="Buscar movimentação, conta…"
                aria-label="Buscar movimentação ou conta"
                class="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
              />
              <kbd
                class="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5"
                >⌘K</kbd
              >
            </div>
            <button
              (click)="theme.toggleTheme()"
              class="h-10 w-10 rounded-full border border-border grid place-items-center hover:bg-muted cursor-pointer"
              [attr.aria-label]="theme.isDark() ? 'Ativar modo claro' : 'Ativar modo escuro'"
            >
              <app-icon
                [name]="theme.isDark() ? 'light_mode' : 'dark_mode'"
                [style]="{ fontSize: '20px' }"
              />
            </button>
            <button
              type="button"
              aria-label="Notificações"
              class="h-10 w-10 rounded-full border border-border grid place-items-center hover:bg-muted transition relative cursor-pointer"
            >
              <app-icon name="notifications" [style]="{ fontSize: '20px' }" />
              <span
                class="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-mint ring-2 ring-background"
              ></span>
            </button>
            <a
              routerLink="/auth/logout"
              title="Sair da conta"
              class="flex items-center gap-2.5 pl-2 pr-3 h-10 rounded-full bg-card border border-border hover:bg-muted transition no-underline"
            >
              <div
                class="h-7 w-7 rounded-full bg-ocean text-white grid place-items-center text-xs font-semibold"
              >
                {{ userInitials }}
              </div>
              <div class="hidden md:block leading-tight">
                <div class="text-xs font-semibold">{{ userName }}</div>
                <div class="text-[10px] text-muted-foreground">{{ userBusiness }}</div>
              </div>
              <app-icon
                name="logout"
                [style]="{ fontSize: '18px' }"
                className="text-muted-foreground ml-1"
              />
            </a>
          </div>
        </header>

        <main class="flex-1 px-6 md:px-10 py-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AppLayoutComponent {
  protected theme = inject(ThemeService);
  private auth = inject(AuthService);
  protected navItems = NAV;

  // Usa o usuário autenticado; mantém "Ana Costa" como fallback enquanto não há dados.
  get userName(): string {
    return this.auth.currentUser()?.nome?.trim() || 'Ana Costa';
  }
  // Dinâmico: vem do usuário autenticado quando disponível; senão, fallback.
  get userBusiness(): string {
    return this.auth.currentUser()?.empresa?.trim() || 'Cantina da Ana';
  }
  get userInitials(): string {
    const parts = this.userName.split(/\s+/).filter(Boolean);
    const initials = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
    return initials.toUpperCase() || 'AC';
  }

  private readonly titles: Record<string, { title: string; sub: string }> = {
    '/': {
      title: 'Contas Financeiras',
      sub: 'Gerencie onde o dinheiro do seu negócio entra e sai.',
    },
    '/movimentacoes': {
      title: 'Movimentações',
      sub: 'Veja, registre e organize entradas e saídas.',
    },
    '/categorias': { title: 'Categorias', sub: 'Organize suas receitas e despesas por categoria.' },
  };

  private router = inject(Router);

  get pageTitle(): string {
    return this.titles[this.router.url]?.title ?? 'Mintly';
  }
  get pageSub(): string {
    return this.titles[this.router.url]?.sub ?? '';
  }
  fillVar(active: boolean): string {
    return active ? "'FILL' 1" : '';
  }
}
