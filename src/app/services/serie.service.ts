import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers, TimeseriesGranularity, TimeseriesReport } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { MintlyClientService } from './mintly-client.service';

/** Modo do seletor Dia / Semana / Mês / Ano (P.3). */
export type ModoPeriodo = 'dia' | 'semana' | 'mes' | 'ano';

/** Quantos pontos cada modo pede (Dia: 30 dias; Semana: 12; Mês: 6; Ano: 12 meses + o ano anterior). */
export const PERIODO: Record<
  ModoPeriodo,
  { granularity: TimeseriesGranularity; points: number; compare?: 'previousYear' }
> = {
  dia: { granularity: 'day', points: 30 },
  semana: { granularity: 'week', points: 12 },
  mes: { granularity: 'month', points: 6 },
  ano: { granularity: 'month', points: 12, compare: 'previousYear' },
};

/** Série dos relatórios por dia, semana ou mês (GET /reports/timeseries), com cache por modo na sessão. */
@Injectable({ providedIn: 'root' })
export class SerieService {
  // Os serviços só são criados quando a série é pedida: a tela que só mostra o "Mês" não depende da API nova.
  private injector = inject(Injector);
  private get auth() {
    return this.injector.get(AuthService);
  }
  private get reportClient() {
    return this.injector.get(MintlyClientService).client.reportClient;
  }
  private cache = new Map<ModoPeriodo, { at: number; data: TimeseriesReport }>();

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      this.auth.onApiError(err);
      if (apiErrorInfo(err).status === 401) {
        if (await this.auth.refresh()) return await fn(this.headers);
        this.injector.get(Router).navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  /** A série do modo. Guarda por 1 minuto: trocar de tela e voltar não pede de novo. */
  async buscar(modo: ModoPeriodo): Promise<TimeseriesReport> {
    const c = this.cache.get(modo);
    if (c && Date.now() - c.at < 60_000) return c.data;
    const res = await this.call((h) => this.reportClient.timeseries(PERIODO[modo], h));
    const data = res.payload ?? {
      granularity: PERIODO[modo].granularity,
      points: [],
      previousYear: null,
    };
    this.cache.set(modo, { at: Date.now(), data });
    return data;
  }

  /** Esquece o que estava guardado (depois de lançar ou mudar algo). */
  limpar(): void {
    this.cache.clear();
  }
}
