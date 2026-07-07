import { Component, Input, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../services/theme.service';
import { LogoComponent } from '../shared/logo.component';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [RouterOutlet, IconComponent],
  template: `
    <div class="min-h-screen w-full bg-background text-foreground">
      <div class="absolute top-4 right-4 z-50">
        <button
          (click)="theme.toggleTheme()"
          class="h-10 w-10 rounded-full border border-border grid place-items-center hover:bg-muted bg-card/80 backdrop-blur cursor-pointer"
          [attr.aria-label]="theme.isDark() ? 'Ativar modo claro' : 'Ativar modo escuro'"
        >
          <app-icon
            [name]="theme.isDark() ? 'light_mode' : 'dark_mode'"
            [style]="{ fontSize: '20px' }"
          />
        </button>
      </div>
      <router-outlet />
    </div>
  `,
})
export class AuthShellComponent {
  protected theme = inject(ThemeService);
}

/** Reusable auth card layout used by individual auth pages */
@Component({
  selector: 'app-auth-card',
  standalone: true,
  imports: [LogoComponent, IconComponent],
  template: `
    @if (wide) {
      <main class="min-h-screen grid place-items-center px-4 py-10">
        <div class="w-full max-w-[560px]">
          <div class="mb-10">
            <app-logo [size]="36" tagline="Gestão para o seu negócio" to="/auth/login" />
          </div>
          <div class="m3-card p-8 md:p-10">
            <h1 class="text-[22px] md:text-[24px] font-bold tracking-tight">{{ title }}</h1>
            @if (subtitle) {
              <p class="text-sm text-muted-foreground mt-1.5 leading-relaxed">{{ subtitle }}</p>
            }
            <div class="mt-7">
              <ng-content />
            </div>
          </div>
          @if (hasFooter) {
            <div class="mt-6 text-center text-sm text-muted-foreground">
              <ng-content select="[slot=footer]" />
            </div>
          }
        </div>
      </main>
    } @else {
      <main class="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
        <div class="flex flex-col px-6 md:px-12 lg:px-16 py-12 xl:py-16">
          <div class="mb-10">
            <app-logo [size]="36" tagline="Gestão para o seu negócio" to="/auth/login" />
          </div>
          <div class="flex-1 grid place-items-center">
            <div class="w-full max-w-[440px]">
              <h1 class="text-[24px] md:text-[28px] font-bold tracking-tight">{{ title }}</h1>
              @if (subtitle) {
                <p class="text-sm text-muted-foreground mt-2 leading-relaxed">{{ subtitle }}</p>
              }
              <div class="mt-8">
                <ng-content />
              </div>
              @if (hasFooter) {
                <div class="mt-7 text-sm text-muted-foreground">
                  <ng-content select="[slot=footer]" />
                </div>
              }
            </div>
          </div>
          <div
            class="pt-8 mt-8 border-t border-border flex items-center gap-2 text-[12px] text-muted-foreground"
          >
            <app-icon name="lock" [style]="{ fontSize: '16px' }" className="text-mint" />
            <span class="truncate"
              >Conexão segura. Seus dados são protegidos por criptografia.</span
            >
          </div>
        </div>

        <div
          class="hidden lg:flex flex-col justify-between p-12 xl:p-16 bg-mint-soft border-l border-border overflow-hidden"
        >
          <div>
            <div
              class="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-card border border-border text-[12px] font-medium text-ocean"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-mint"></span>
              Plataforma financeira para food service
            </div>
            <h2
              class="mt-6 text-[28px] xl:text-[34px] font-bold tracking-tight leading-[1.15] text-foreground max-w-[420px]"
            >
              Tenha o controle financeiro do seu restaurante em minutos.
            </h2>
            <p class="mt-4 text-[14px] text-foreground/70 max-w-[420px] leading-relaxed">
              Mintly é a forma mais simples de organizar o dinheiro do seu negócio — sem planilhas,
              sem complicação.
            </p>
          </div>

          <ul class="space-y-3 max-w-[420px]">
            @for (it of asideItems; track it.icon) {
              <li class="flex items-start gap-3 p-3.5 rounded-2xl bg-card/70 border border-border">
                <div
                  class="h-9 w-9 rounded-xl bg-mint-soft grid place-items-center text-ocean shrink-0"
                >
                  <app-icon [name]="it.icon" [style]="{ fontSize: '20px' }" />
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold truncate">{{ it.title }}</div>
                  <div class="text-[12.5px] text-muted-foreground leading-snug">{{ it.text }}</div>
                </div>
              </li>
            }
          </ul>

          <div class="flex items-center gap-3 text-[12px] text-foreground/60">
            <app-icon name="verified_user" [style]="{ fontSize: '16px' }" className="text-mint" />
            <span>Criptografia de ponta a ponta · LGPD</span>
          </div>
        </div>
      </main>
    }
  `,
})
export class AuthCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() wide = false;
  @Input() hasFooter = false;

  protected asideItems = [
    {
      icon: 'account_balance',
      title: 'Contas centralizadas',
      text: 'Bancos, caixas e plataformas em um só lugar.',
    },
    {
      icon: 'category',
      title: 'Categorias inteligentes',
      text: 'Organize receitas e despesas sem esforço.',
    },
    {
      icon: 'trending_up',
      title: 'Visão real do caixa',
      text: 'Acompanhe entradas e saídas com clareza.',
    },
  ];
}
