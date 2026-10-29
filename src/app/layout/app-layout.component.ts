import { Component, ElementRef, OnInit, effect, signal, inject, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { ThemeService } from '../services/theme.service';
import { AuthService } from '../services/auth.service';
import { NotificationsService, AppNotification } from '../services/notifications.service';
import { LogoComponent } from '../shared/logo.component';
import { IconComponent } from '../shared/icon.component';
import { ToastService } from '../shared/toast.service';
import { AVATAR_ACCEPT, readAvatarFile } from '../shared/avatar-file';
import { fmtEndsAt } from '../pages/assinatura/assinatura.format';

const NAV = [
  { to: '/visao-geral', label: 'Visão Geral', icon: 'space_dashboard' },
  { to: '/fluxo-de-caixa', label: 'Fluxo de Caixa', icon: 'account_balance_wallet' },
  { to: '/receitas', label: 'Receitas', icon: 'trending_up' },
  { to: '/custos', label: 'Custos & Despesas', icon: 'trending_down' },
  { to: '/resultado', label: 'Resultado', icon: 'savings' },
  { to: '/previsoes', label: 'Previsões', icon: 'auto_graph' },
  { to: '/movimentacoes', label: 'Movimentações', icon: 'swap_horiz' },
  { to: '/contas', label: 'Contas Financeiras', icon: 'account_balance' },
  { to: '/categorias', label: 'Categorias', icon: 'category' },
] as const;

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    LogoComponent,
    IconComponent,
  ],
  host: {
    '(document:keydown.escape)': 'menuOpen.set(false)',
    '(window:resize)': 'closeMenuOnDesktop()',
  },
  template: `
    <div class="min-h-screen w-full flex bg-background text-foreground">
      <!-- Sidebar -->
      <aside
        class="w-[260px] shrink-0 hidden md:flex flex-col border-r border-border bg-sidebar sticky top-0 h-screen"
      >
        <div class="px-6 py-5">
          <app-logo [size]="30" tagline="Gestão para o seu negócio" to="/" />
        </div>

        <ng-container [ngTemplateOutlet]="navContent" />
      </aside>

      <ng-template #navContent>
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
              [routerLinkActiveOptions]="{ exact: true }"
              #rla="routerLinkActive"
              (click)="menuOpen.set(false)"
              class="group flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-sm font-medium transition-colors text-foreground/75 hover:bg-muted hover:text-foreground"
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
      </ng-template>

      <!-- Menu no celular: o mesmo menu da barra lateral, em uma gaveta -->
      @if (menuOpen()) {
        <div class="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            (click)="menuOpen.set(false)"
            class="absolute inset-0 bg-black/50 cursor-default"
          ></button>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            class="absolute left-0 top-0 h-full w-[280px] max-w-[85vw] flex flex-col border-r border-border bg-sidebar overflow-y-auto"
          >
            <div class="px-6 py-5 flex items-start justify-between gap-2">
              <app-logo [size]="30" tagline="Gestão para o seu negócio" to="/" />
              <button
                type="button"
                aria-label="Fechar menu"
                (click)="menuOpen.set(false)"
                class="h-10 w-10 -mr-3 -mt-1 rounded-full grid place-items-center hover:bg-muted cursor-pointer"
              >
                <app-icon name="close" [style]="{ fontSize: '22px' }" />
              </button>
            </div>
            <ng-container [ngTemplateOutlet]="navContent" />
            <button
              type="button"
              (click)="theme.toggleTheme()"
              class="mx-3 mb-4 flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-foreground/75 hover:bg-muted cursor-pointer"
            >
              <app-icon
                [name]="theme.isDark() ? 'light_mode' : 'dark_mode'"
                [style]="{ fontSize: '20px' }"
              />
              {{ theme.isDark() ? 'Ativar modo claro' : 'Ativar modo escuro' }}
            </button>
          </aside>
        </div>
      }

      <!-- Main -->
      <div class="flex-1 min-w-0 flex flex-col">
        <header
          class="sticky top-0 z-20 h-[68px] border-b border-border bg-background/85 backdrop-blur flex items-center px-4 md:px-10 gap-3 md:gap-4"
        >
          <button
            type="button"
            (click)="menuOpen.set(true)"
            aria-label="Abrir menu"
            [attr.aria-expanded]="menuOpen()"
            class="md:hidden h-10 w-10 -ml-1 shrink-0 rounded-full border border-border grid place-items-center hover:bg-muted cursor-pointer"
          >
            <app-icon name="menu" [style]="{ fontSize: '22px' }" />
          </button>
          <div class="min-w-0">
            <h1 class="text-[18px] sm:text-[20px] md:text-[22px] font-bold tracking-tight truncate">
              {{ pageTitle }}
            </h1>
            <p class="text-[13px] text-muted-foreground truncate">{{ pageSub }}</p>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <button
              (click)="theme.toggleTheme()"
              class="hidden sm:grid h-10 w-10 rounded-full border border-border place-items-center hover:bg-muted cursor-pointer"
              [attr.aria-label]="theme.isDark() ? 'Ativar modo claro' : 'Ativar modo escuro'"
            >
              <app-icon
                [name]="theme.isDark() ? 'light_mode' : 'dark_mode'"
                [style]="{ fontSize: '20px' }"
              />
            </button>
            <div class="relative">
              <button
                type="button"
                (click)="notificationsOpen.set(!notificationsOpen())"
                aria-label="Notificações"
                [attr.aria-expanded]="notificationsOpen()"
                class="h-10 w-10 rounded-full border border-border grid place-items-center hover:bg-muted transition relative cursor-pointer"
              >
                <app-icon name="notifications" [style]="{ fontSize: '20px' }" />
                @if (notifications.count() > 0) {
                  <span
                    class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-mint text-primary-foreground text-[10px] font-bold grid place-items-center ring-2 ring-background"
                  >
                    {{ notifications.count() > 9 ? '9+' : notifications.count() }}
                  </span>
                }
              </button>

              @if (notificationsOpen()) {
                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
                <div class="fixed inset-0 z-30" (click)="notificationsOpen.set(false)"></div>
                <div
                  class="fixed left-3 right-3 top-[76px] md:absolute md:left-auto md:right-0 md:top-[calc(100%+8px)] z-40 md:w-[360px] max-h-[440px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
                >
                  <div
                    class="px-4 py-3 border-b border-border flex items-center justify-between shrink-0"
                  >
                    <span class="font-semibold text-[14px]">Notificações</span>
                  </div>
                  <div class="overflow-y-auto flex-1">
                    @if (notifications.notifications().length === 0) {
                      <div class="px-4 py-8 text-center text-[13px] text-muted-foreground">
                        Nenhuma notificação por aqui.
                      </div>
                    } @else {
                      @for (n of notifications.notifications(); track n.id) {
                        <div
                          class="px-4 py-3 border-b border-border/60 last:border-0 transition-colors bg-mint-soft/20"
                        >
                          <div class="flex items-start gap-2.5">
                            <span
                              class="h-8 w-8 shrink-0 rounded-xl grid place-items-center bg-warning/10 text-warning"
                            >
                              <app-icon
                                [name]="n.kind === 'subscription' ? 'credit_card' : 'sell'"
                                [style]="{ fontSize: '16px' }"
                              />
                            </span>
                            <div class="min-w-0 flex-1">
                              <div class="text-[13px] font-semibold leading-snug">
                                {{ n.title }}
                              </div>
                              <p class="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                                {{ n.description }}
                              </p>
                              <div class="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  (click)="goToNotification(n)"
                                  class="h-7 px-2.5 rounded-lg bg-mint-soft text-ocean text-[11.5px] font-semibold hover:brightness-95 cursor-pointer"
                                >
                                  {{ n.actionLabel }}
                                </button>
                                <button
                                  type="button"
                                  (click)="dismissNotification(n)"
                                  class="h-7 px-2.5 rounded-lg text-[11.5px] font-medium text-muted-foreground hover:bg-muted cursor-pointer"
                                >
                                  {{ n.dismissLabel }}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      }
                    }
                  </div>
                </div>
              }
            </div>
            <div class="relative">
              <button
                type="button"
                (click)="userMenuOpen.set(!userMenuOpen())"
                aria-label="Menu da conta"
                aria-haspopup="menu"
                [attr.aria-expanded]="userMenuOpen()"
                [disabled]="avatarBusy()"
                class="flex items-center gap-2.5 pl-2 pr-3 h-10 rounded-full bg-card border border-border hover:bg-muted transition cursor-pointer disabled:opacity-60"
              >
                @if (userAvatar; as avatar) {
                  <img [src]="avatar" alt="" class="h-7 w-7 rounded-full object-cover shrink-0" />
                } @else {
                  <div
                    class="h-7 w-7 rounded-full bg-ocean text-white grid place-items-center text-xs font-semibold shrink-0"
                  >
                    {{ userInitials }}
                  </div>
                }
                <div class="hidden md:block leading-tight text-left">
                  <div class="text-xs font-semibold">{{ userName }}</div>
                  <div class="text-[10px] text-muted-foreground">{{ userBusiness }}</div>
                </div>
                <app-icon
                  name="expand_more"
                  [style]="{ fontSize: '18px' }"
                  className="text-muted-foreground"
                />
              </button>

              @if (userMenuOpen()) {
                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
                <div class="fixed inset-0 z-30" (click)="userMenuOpen.set(false)"></div>
                <div
                  role="menu"
                  class="absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden py-1.5"
                >
                  <button
                    type="button"
                    role="menuitem"
                    (click)="pickAvatar()"
                    class="w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-muted text-left cursor-pointer"
                  >
                    <app-icon name="photo_camera" [style]="{ fontSize: '19px' }" />
                    {{ userAvatar ? 'Trocar foto' : 'Adicionar foto' }}
                  </button>
                  @if (userAvatar) {
                    <button
                      type="button"
                      role="menuitem"
                      (click)="removeAvatar()"
                      class="w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-muted text-left cursor-pointer"
                    >
                      <app-icon name="delete" [style]="{ fontSize: '19px' }" />
                      Remover foto
                    </button>
                  }
                  <a
                    routerLink="/assinatura"
                    role="menuitem"
                    (click)="userMenuOpen.set(false)"
                    class="flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-muted no-underline text-foreground"
                  >
                    <app-icon name="credit_card" [style]="{ fontSize: '19px' }" />
                    <span class="leading-tight">
                      Minha assinatura
                      @if (subscriptionEnds) {
                        <span class="block text-[11px] text-muted-foreground"
                          >Até {{ subscriptionEnds }}</span
                        >
                      }
                    </span>
                  </a>
                  <div class="my-1.5 border-t border-border"></div>
                  <a
                    routerLink="/auth/logout"
                    role="menuitem"
                    class="flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-muted no-underline text-foreground"
                  >
                    <app-icon name="logout" [style]="{ fontSize: '19px' }" />
                    Sair da conta
                  </a>
                </div>
              }
              <input
                #avatarInput
                type="file"
                class="hidden"
                [accept]="avatarAccept"
                (change)="onAvatarFile($event)"
              />
            </div>
          </div>
        </header>

        <main class="flex-1 px-4 sm:px-6 md:px-10 py-6 md:py-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AppLayoutComponent implements OnInit {
  protected theme = inject(ThemeService);
  private auth = inject(AuthService);
  protected notifications = inject(NotificationsService);
  protected navItems = NAV;
  private toast = inject(ToastService);
  protected notificationsOpen = signal(false);
  /** Gaveta do menu no celular (abaixo de 768 px a barra lateral não aparece). */
  protected menuOpen = signal(false);
  protected userMenuOpen = signal(false);
  protected avatarBusy = signal(false);
  protected readonly avatarAccept = AVATAR_ACCEPT;
  private avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');

  constructor() {
    // Com a gaveta aberta, a página de trás não rola.
    effect(() => {
      document.body.style.overflow = this.menuOpen() ? 'hidden' : '';
    });
  }

  protected closeMenuOnDesktop(): void {
    if (window.innerWidth >= 768) this.menuOpen.set(false);
  }

  ngOnInit(): void {
    this.notifications.refresh().catch(() => {
      // Silencioso: notificações são um extra, não deve travar o layout se falhar.
    });
  }

  pickAvatar(): void {
    this.userMenuOpen.set(false);
    this.avatarInput()?.nativeElement.click();
  }

  async onAvatarFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    this.avatarBusy.set(true);
    try {
      await this.auth.updateAvatar(await readAvatarFile(file));
      this.toast.success('Foto de perfil atualizada.');
    } catch (err) {
      this.toast.error(this.avatarErrorMessage(err, 'Não foi possível atualizar a foto.'));
    } finally {
      this.avatarBusy.set(false);
    }
  }

  async removeAvatar(): Promise<void> {
    this.userMenuOpen.set(false);
    this.avatarBusy.set(true);
    try {
      await this.auth.removeAvatar();
      this.toast.success('Foto removida.');
    } catch (err) {
      this.toast.error(this.avatarErrorMessage(err, 'Não foi possível remover a foto.'));
    } finally {
      this.avatarBusy.set(false);
    }
  }

  private avatarErrorMessage(err: unknown, fallback: string): string {
    const api = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return api ?? (err instanceof Error && !('response' in err) ? err.message : fallback);
  }

  goToNotification(n: AppNotification): void {
    this.notificationsOpen.set(false);
    this.router.navigate([n.actionRoute], { queryParams: n.actionQueryParams });
  }

  /** "Não quero mudar": mantém o preço e o aviso some (só volta daqui a ~5,5 meses). */
  async dismissNotification(n: AppNotification): Promise<void> {
    if (n.kind === 'subscription') {
      this.notifications.dismissSubscriptionNotice();
      this.toast.info('Tudo bem. Lembramos de novo na próxima vez que você entrar.');
      return;
    }
    try {
      await this.notifications.keepPrice(n);
      this.toast.info(
        `Certo! Só voltamos a avisar sobre ${n.itemName} daqui a uns 5 meses e meio.`,
      );
    } catch {
      this.toast.error('Não foi possível registrar agora. Tente novamente.');
    }
  }

  // Usa o usuário autenticado; mantém "Ana Costa" como fallback enquanto não há dados.
  get userName(): string {
    return this.auth.currentUser()?.nome?.trim() || 'Minha conta';
  }
  // Dinâmico: vem do usuário autenticado quando disponível; senão, fallback.
  get userBusiness(): string {
    return this.auth.currentUser()?.empresa?.trim() || 'Meu negócio';
  }
  /** Data limite da assinatura, para o menu da conta ("30/11/2026"). */
  get subscriptionEnds(): string {
    return fmtEndsAt(this.auth.subscriptionState().endsAt);
  }
  get userInitials(): string {
    const parts = this.userName.split(/\s+/).filter(Boolean);
    const initials = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
    return initials.toUpperCase() || 'AC';
  }
  /** Foto de perfil (vem do servidor no login; troca/remoção pelo menu da conta). */
  get userAvatar(): string | null {
    return this.auth.currentUser()?.avatarDataUrl ?? null;
  }

  private readonly titles: Record<string, { title: string; sub: string }> = {
    '/contas': {
      title: 'Contas Financeiras',
      sub: 'Gerencie onde o dinheiro do seu negócio entra e sai.',
    },
    '/visao-geral': { title: 'Visão Geral', sub: 'Como está seu restaurante hoje' },
    '/fluxo-de-caixa': { title: 'Fluxo de Caixa', sub: 'Seu dinheiro hoje e nos próximos dias' },
    '/receitas': { title: 'Receitas', sub: 'De onde vem o seu faturamento' },
    '/custos': { title: 'Custos & Despesas', sub: 'Para onde vai o seu dinheiro' },
    '/resultado': { title: 'Resultado', sub: 'Quanto sobrou no fim das contas' },
    '/previsoes': { title: 'Previsões & Insights', sub: 'O que vem pela frente' },
    '/movimentacoes': {
      title: 'Movimentações',
      sub: 'Veja, registre e organize entradas e saídas.',
    },
    '/categorias': { title: 'Categorias', sub: 'Organize suas receitas e despesas por categoria.' },
  };

  private router = inject(Router);

  /** Caminho atual sem query/fragmento ('/movimentacoes?x=1' → '/movimentacoes'). */
  private path(): string {
    return this.router.url.split(/[?#]/)[0];
  }

  get pageTitle(): string {
    return this.titles[this.path()]?.title ?? 'Mintly';
  }
  get pageSub(): string {
    return this.titles[this.path()]?.sub ?? '';
  }
  fillVar(active: boolean): string {
    return active ? "'FILL' 1" : '';
  }
}
