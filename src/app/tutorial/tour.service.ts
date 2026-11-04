import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { TourStep, stepsForPage } from './tour-steps';

/** Elemento marcado com `data-tour="<alvo>"` que está visível agora (ocupa espaço na tela). */
export function findTourTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of Array.from(all)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/**
 * Tutorial guiado da página (botão "?" do cabeçalho): uma sequência de passos, cada um destacando um elemento
 * da tela com uma explicação. Só entram os passos cujo elemento está visível agora.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private router = inject(Router);

  readonly active = signal(false);
  readonly steps = signal<TourStep[]>([]);
  readonly index = signal(0);

  readonly current = computed(() => (this.active() ? (this.steps()[this.index()] ?? null) : null));
  readonly total = computed(() => this.steps().length);
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() >= this.steps().length - 1);

  constructor() {
    // Trocar de tela com o tutorial aberto encerra o tutorial (os alvos mudam).
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.stop();
    });
  }

  /** Inicia o tutorial da página em `url`. Devolve false se nenhum passo tem alvo visível. */
  start(url: string): boolean {
    const visiveis = stepsForPage(url).filter((s) => findTourTarget(s.target) !== null);
    if (visiveis.length === 0) return false;
    this.steps.set(visiveis);
    this.index.set(0);
    this.active.set(true);
    return true;
  }

  next(): void {
    if (this.isLast()) this.stop();
    else this.index.update((i) => i + 1);
  }

  prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  stop(): void {
    if (!this.active()) return;
    this.active.set(false);
    this.steps.set([]);
    this.index.set(0);
  }
}
