import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';

/** Tempo mínimo de cada passo na tela, para dar para ver o que está sendo preparado. */
const STEP_MS = 900;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface OnboardingStep {
  icon: string;
  title: string;
  text: string;
}

/** Textos dos 3 passos; usam o que a conta realmente tem quando já foi carregado. */
export function onboardingSteps(contaNome: string | null, categorias: string[]): OnboardingStep[] {
  return [
    {
      icon: 'account_balance',
      title: 'Criando sua conta financeira',
      text: contaNome
        ? `Conta inicial pronta: ${contaNome}.`
        : 'Configuramos uma conta inicial para você começar.',
    },
    {
      icon: 'category',
      title: 'Organizando categorias padrão',
      text: categorias.length
        ? categorias.join(', ') + '.'
        : 'Venda Balcão, Delivery, CMV, Salários, Aluguel e Impostos.',
    },
    {
      icon: 'auto_awesome',
      title: 'Preparando sua estrutura financeira',
      text: 'Tudo pronto para registrar entradas e saídas.',
    },
  ];
}

/**
 * Primeiros passos, logo depois do cadastro: boas-vindas e uma tela de preparo que mostra a conta
 * inicial e as categorias padrão que o cadastro já criou. "Começar" confere esses dados de verdade
 * (conta e categorias) e "Acessar minha conta" leva às Contas financeiras.
 */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [AuthCardComponent, IconComponent],
  template: `
    @if (!started()) {
      <app-auth-card
        [wide]="true"
        title="Bem-vindo ao Mintly"
        subtitle="Vamos preparar sua conta em poucos segundos. Criaremos sua conta financeira inicial e as categorias padrão para você começar."
      >
        <div class="flex items-center justify-center mb-2">
          <div class="h-16 w-16 rounded-2xl bg-mint-soft grid place-items-center text-ocean">
            <app-icon name="rocket_launch" [style]="{ fontSize: '32px' }" />
          </div>
        </div>
        <div class="space-y-3 mt-4">
          <button
            type="button"
            (click)="start()"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Começar</span>
            <app-icon name="arrow_forward" [style]="{ fontSize: '20px' }" />
          </button>
          <button
            type="button"
            (click)="goLogin()"
            class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <app-icon name="login" [style]="{ fontSize: '20px' }" />
            <span>Já configurei, ir para o login</span>
          </button>
        </div>
      </app-auth-card>
    } @else {
      <app-auth-card
        [wide]="true"
        [title]="done() ? 'Pronto! Sua conta está preparada' : 'Estamos preparando sua conta'"
        [subtitle]="
          done()
            ? 'Você já pode começar a registrar movimentações e acompanhar o caixa do seu negócio.'
            : 'Leva apenas alguns segundos. Estamos configurando o essencial para você começar.'
        "
      >
        <ol class="space-y-3">
          @for (s of steps(); track s.icon; let i = $index) {
            <li
              [class]="
                'flex items-center gap-4 p-4 rounded-2xl border transition ' +
                (stateOf(i) === 'done'
                  ? 'bg-mint-soft/60 border-mint/30'
                  : stateOf(i) === 'active'
                    ? 'bg-card border-mint shadow-sm'
                    : 'bg-card border-border opacity-70')
              "
            >
              <div
                [class]="
                  'h-11 w-11 rounded-xl grid place-items-center shrink-0 ' +
                  (stateOf(i) === 'done'
                    ? 'bg-mint text-primary-foreground'
                    : stateOf(i) === 'active'
                      ? 'bg-mint-soft text-ocean'
                      : 'bg-muted text-muted-foreground')
                "
              >
                <app-icon
                  [name]="
                    stateOf(i) === 'done'
                      ? 'check'
                      : stateOf(i) === 'active'
                        ? 'progress_activity'
                        : s.icon
                  "
                  [className]="stateOf(i) === 'active' ? 'animate-spin' : ''"
                  [style]="{ fontSize: '22px' }"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-foreground truncate">{{ s.title }}</div>
                <div class="text-[12.5px] text-muted-foreground truncate">{{ s.text }}</div>
              </div>
              <span
                [class]="
                  'text-[11px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ' +
                  (stateOf(i) === 'done'
                    ? 'bg-mint text-primary-foreground'
                    : stateOf(i) === 'active'
                      ? 'bg-ocean-soft text-ocean'
                      : 'bg-muted text-muted-foreground')
                "
              >
                {{
                  stateOf(i) === 'done'
                    ? 'Pronto'
                    : stateOf(i) === 'active'
                      ? 'Em andamento'
                      : 'Aguardando'
                }}
              </span>
            </li>
          }
        </ol>

        <div class="mt-7">
          <div
            class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2"
          >
            {{ done() ? 'Categorias criadas' : 'Categorias que serão criadas' }}
          </div>
          <div class="flex flex-wrap gap-2">
            @for (c of categoriasChips(); track c) {
              <span
                class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-muted/70 border border-border text-[12px] text-foreground/80"
              >
                <app-icon
                  name="local_offer"
                  [style]="{ fontSize: '14px' }"
                  className="text-ocean"
                />
                <span class="truncate max-w-[140px]">{{ c }}</span>
              </span>
            }
          </div>
        </div>

        <div class="mt-8">
          <button
            type="button"
            [disabled]="!done()"
            (click)="enter()"
            class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{{ done() ? 'Acessar minha conta' : 'Preparando…' }}</span>
            <app-icon name="arrow_forward" [style]="{ fontSize: '20px' }" />
          </button>
        </div>
      </app-auth-card>
    }
  `,
})
export class OnboardingComponent {
  private router = inject(Router);
  private contas = inject(ContasService);
  private categorias = inject(CategoriasService);
  private toast = inject(ToastService);

  protected started = signal(false);
  /** Quantos passos já terminaram (0 a 3). */
  protected progress = signal(0);
  protected done = computed(() => this.progress() >= 3);

  private contaNome = computed(() => {
    const ativas = this.contas.accounts().filter((a) => a.active);
    return (ativas.find((a) => a.isDefault) ?? ativas[0])?.name ?? null;
  });
  private nomesCategorias = computed(() =>
    this.categorias
      .categories()
      .filter((c) => c.active)
      .map((c) => c.name),
  );

  protected steps = computed(() => onboardingSteps(this.contaNome(), this.nomesCategorias()));
  protected categoriasChips = computed(() => {
    const nomes = this.nomesCategorias();
    return nomes.length
      ? nomes
      : ['Venda Balcão', 'Venda Delivery', 'CMV/Insumos', 'Salários', 'Aluguel', 'Impostos'];
  });

  protected stateOf(i: number): 'done' | 'active' | 'todo' {
    return i < this.progress() ? 'done' : i === this.progress() ? 'active' : 'todo';
  }

  /** Cada passo confere o dado de verdade (conta, categorias) e segura STEP_MS para dar para ver. */
  async start(): Promise<void> {
    this.started.set(true);
    await this.step(() => this.contas.refresh());
    await this.step(() => this.categorias.refresh());
    await this.step(() => Promise.resolve());
  }

  private async step(load: () => Promise<void>): Promise<void> {
    try {
      await Promise.all([load(), delay(STEP_MS)]);
    } catch {
      // Não trava a pessoa na tela: a conta já foi criada no cadastro; só não deu para conferir.
      this.toast.error('Não foi possível conferir tudo agora, mas sua conta já está criada.');
      await delay(STEP_MS);
    }
    this.progress.update((p) => p + 1);
  }

  goLogin(): void {
    this.router.navigate(['/auth/login']);
  }

  enter(): void {
    if (!this.done()) return;
    this.router.navigate(['/contas']);
  }
}
