import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Tempo sem usar o app (nenhuma aba) até a sessão ser encerrada por segurança. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const IDLE_TIMEOUT_MINUTES = IDLE_TIMEOUT_MS / 60_000;

/** Último uso do app, em ms. Fica no localStorage para valer para TODAS as abas abertas. */
export const LAST_ACTIVITY_KEY = 'mintly-last-activity';

const CHECK_EVERY_MS = 15_000;
const STORE_EVERY_MS = 5_000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'];

/**
 * Encerra a sessão de quem deixa o app aberto sem usar. Qualquer mouse, toque, tecla ou rolagem, em
 * qualquer aba, conta como uso. Ao voltar para uma aba (ou depois do computador dormir) a checagem roda
 * na hora, sem esperar o próximo ciclo: os temporizadores de abas em segundo plano são imprecisos.
 * Quem sai por inatividade cai em `/auth/sessao-expirada?motivo=inatividade`, com o aviso.
 */
@Injectable({ providedIn: 'root' })
export class IdleSessionService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private zone = inject(NgZone);

  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;
  private lastStored = 0;

  private readonly onActivity = (): void => this.touch();
  private readonly onReturn = (): void => {
    if (document.visibilityState === 'visible') this.check();
  };

  /** Começa a vigiar. Abrir/recarregar o app já conta como uso. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.touch(true);
    // Fora da zona do Angular: movimento do mouse não pode disparar detecção de mudanças.
    this.zone.runOutsideAngular(() => {
      for (const name of ACTIVITY_EVENTS) {
        window.addEventListener(name, this.onActivity, { passive: true, capture: true });
      }
      document.addEventListener('visibilitychange', this.onReturn);
      window.addEventListener('focus', this.onReturn);
      this.timer = setInterval(() => this.check(), CHECK_EVERY_MS);
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const name of ACTIVITY_EVENTS) {
      window.removeEventListener(name, this.onActivity, { capture: true });
    }
    document.removeEventListener('visibilitychange', this.onReturn);
    window.removeEventListener('focus', this.onReturn);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    try {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      /* sem storage */
    }
  }

  private touch(force = false): void {
    const now = Date.now();
    this.lastSeen = now;
    if (!force && now - this.lastStored < STORE_EVERY_MS) return;
    this.lastStored = now;
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    } catch {
      /* sem storage: vale só o uso desta aba */
    }
  }

  /** O uso mais recente entre esta aba e as demais. */
  private lastActivity(): number {
    let stored = 0;
    try {
      stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    } catch {
      /* sem storage */
    }
    return Math.max(this.lastSeen, Number.isFinite(stored) ? stored : 0);
  }

  private check(): void {
    if (!this.running) return;
    if (Date.now() - this.lastActivity() >= IDLE_TIMEOUT_MS) void this.expire();
  }

  private async expire(): Promise<void> {
    this.stop();
    await this.zone.run(async () => {
      await this.auth.logout(false);
      await this.router.navigate(['/auth/sessao-expirada'], {
        queryParams: { motivo: 'inatividade' },
      });
    });
  }
}
