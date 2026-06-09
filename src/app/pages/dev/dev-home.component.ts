import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ThemeService } from '../../services/theme.service';
import { LogoComponent } from '../../shared/logo.component';
import { IconComponent } from '../../shared/icon.component';
import { FinanceShowcaseComponent } from './finance-showcase.component';

type DevTab = 'overview' | 'components';

/**
 * Hub de desenvolvimento (/dev): informações de ambiente e a galeria de
 * componentes do design system. Usa só o design system do finance
 * (Tailwind + tema único), sem Angular Material.
 */
@Component({
  selector: 'app-dev-home',
  standalone: true,
  imports: [RouterLink, LogoComponent, IconComponent, FinanceShowcaseComponent],
  template: `
    <div class="min-h-screen bg-background text-foreground">
      <header
        class="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur px-6 md:px-10 h-[68px] flex items-center gap-4"
      >
        <app-logo [size]="28" tagline="Dev hub" to="/dev" />
        <span
          class="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-mint-soft text-ocean text-[12px] font-semibold"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-mint"></span>{{ env.name }}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            (click)="theme.toggleTheme()"
            class="h-10 w-10 rounded-full border border-border grid place-items-center hover:bg-muted cursor-pointer"
            [attr.aria-label]="theme.isDark() ? 'Ativar modo claro' : 'Ativar modo escuro'"
          >
            <app-icon
              [name]="theme.isDark() ? 'light_mode' : 'dark_mode'"
              [style]="{ fontSize: '20px' }"
            />
          </button>
          <a
            routerLink="/"
            class="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-mint text-primary-foreground text-sm font-semibold hover:brightness-95 no-underline"
          >
            <app-icon name="arrow_forward" [style]="{ fontSize: '18px' }" />
            Abrir app
          </a>
        </div>
      </header>

      <nav class="px-6 md:px-10 border-b border-border flex gap-1">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            (click)="tab.set(t.id)"
            [class]="
              'h-11 px-4 text-sm font-medium border-b-2 -mb-px transition cursor-pointer ' +
              (tab() === t.id
                ? 'border-mint text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            "
          >
            {{ t.label }}
          </button>
        }
      </nav>

      <main class="px-6 md:px-10 py-8 max-w-5xl mx-auto">
        @if (tab() === 'overview') {
          <div class="space-y-6">
            <div>
              <h1 class="text-2xl font-bold tracking-tight">Ambiente de desenvolvimento</h1>
              <p class="text-muted-foreground text-sm mt-1">
                Informações do build atual e atalhos para testar componentes.
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="m3-card p-5 flex flex-col gap-1">
                <span class="text-[12px] text-muted-foreground uppercase tracking-wide"
                  >Ambiente</span
                >
                <span class="text-lg font-bold">{{ env.name }}</span>
              </div>
              <div class="m3-card p-5 flex flex-col gap-1">
                <span class="text-[12px] text-muted-foreground uppercase tracking-wide">API</span>
                <span class="text-sm font-semibold break-all">{{ env.apiUrl }}</span>
              </div>
              <div class="m3-card p-5 flex flex-col gap-1">
                <span class="text-[12px] text-muted-foreground uppercase tracking-wide"
                  >Dev tools</span
                >
                <span class="text-lg font-bold">{{
                  env.enableDevTools ? 'Ativadas' : 'Desativadas'
                }}</span>
              </div>
            </div>
          </div>
        } @else {
          <div class="space-y-6">
            <div>
              <h1 class="text-2xl font-bold tracking-tight">Componentes</h1>
              <p class="text-muted-foreground text-sm mt-1">
                Galeria do design system do finance. Use para testar variações manualmente.
              </p>
            </div>
            <app-finance-showcase />
          </div>
        }
      </main>
    </div>
  `,
})
export class DevHomeComponent {
  protected theme = inject(ThemeService);
  protected readonly env = environment;
  protected tab = signal<DevTab>('components');

  protected readonly tabs: { id: DevTab; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'components', label: 'Componentes' },
  ];
}
