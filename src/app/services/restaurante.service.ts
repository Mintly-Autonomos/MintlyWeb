import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TaxRegime } from 'mintly-lib';
import type { Headers, RestaurantTaxProfile as LibTaxProfile } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { localISOMonth } from '../shared/format';
import { MintlyClientService } from './mintly-client.service';

export type TaxRegimeKey = 'mei' | 'simplesNacionalAnexoI';

export interface TaxBracket {
  index: number;
  upTo: number;
  nominalRate: number;
  deduction: number;
}

export type TaxInsight =
  | {
      kind: 'bracketChanged';
      severity: 'warning';
      fromBracket: number;
      toBracket: number;
      fromRate: number;
      toRate: number;
      rbt12: number;
    }
  | {
      kind: 'meiCapNear';
      severity: 'warning';
      usedPct: number;
      yearToDateRevenue: number;
      annualLimit: number;
    }
  | { kind: 'simplesLimitExceeded'; severity: 'warning'; rbt12: number }
  | { kind: 'taxRegimeNotConfigured'; severity: 'info' };

export interface RestaurantTaxProfile {
  regime: TaxRegimeKey | null;
  referenceMonth: string;
  rbt12: number;
  monthsOfHistory: number;
  rbt12Proportional: boolean;
  effectiveRate: number | null;
  bracket: TaxBracket | null;
  previousBracketIndex: number | null;
  meiMonthlyDas: number | null;
  meiCap: { annualLimit: number; yearToDateRevenue: number; usedPct: number } | null;
  insights: TaxInsight[];
}

export interface RestaurantProfile {
  name: string;
  taxRegime: TaxRegimeKey | null;
  tax: RestaurantTaxProfile;
}

const REGIME_TO_LIB: Record<TaxRegimeKey, TaxRegime> = {
  mei: TaxRegime.Mei,
  simplesNacionalAnexoI: TaxRegime.SimplesNacionalAnexoI,
};
const REGIME_FROM_LIB: Record<TaxRegime, TaxRegimeKey> = {
  [TaxRegime.Mei]: 'mei',
  [TaxRegime.SimplesNacionalAnexoI]: 'simplesNacionalAnexoI',
};

function toProfile(
  name: string,
  taxRegime: TaxRegime | undefined,
  tax: LibTaxProfile,
): RestaurantProfile {
  return {
    name,
    taxRegime: taxRegime ? REGIME_FROM_LIB[taxRegime] : null,
    tax: {
      regime: tax.regime ? REGIME_FROM_LIB[tax.regime] : null,
      referenceMonth: tax.referenceMonth,
      rbt12: tax.rbt12,
      monthsOfHistory: tax.monthsOfHistory,
      rbt12Proportional: tax.rbt12Proportional,
      effectiveRate: tax.effectiveRate,
      bracket: tax.bracket,
      previousBracketIndex: tax.previousBracketIndex,
      meiMonthlyDas: tax.meiMonthlyDas,
      meiCap: tax.meiCap,
      insights: tax.insights as TaxInsight[],
    },
  };
}

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Seed do modo mock — restaurante sem regime configurado (estado padrão real documentado no guia-front). */
const mockState: { name: string; taxRegime: TaxRegimeKey | null } = {
  name: 'Seoul Bird',
  taxRegime: null,
};

@Injectable({ providedIn: 'root' })
export class RestauranteService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private restaurantClient = inject(MintlyClientService).client.restaurantClient;

  readonly profile = signal<RestaurantProfile | null>(null);
  readonly loading = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (this.isUnauthorized(err)) {
        const refreshed = await this.auth.refresh();
        if (refreshed) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return typeof err === 'object' && err !== null && apiErrorInfo(err).status === 401;
  }

  private mockProfile(month?: string): RestaurantProfile {
    return {
      name: mockState.name,
      taxRegime: mockState.taxRegime,
      tax: {
        regime: mockState.taxRegime,
        referenceMonth: month ?? localISOMonth(),
        rbt12: 0,
        monthsOfHistory: 0,
        rbt12Proportional: true,
        effectiveRate: null,
        bracket: null,
        previousBracketIndex: null,
        meiMonthlyDas: null,
        meiCap: null,
        insights: mockState.taxRegime ? [] : [{ kind: 'taxRegimeNotConfigured', severity: 'info' }],
      },
    };
  }

  async refresh(month?: string): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useMocks) {
        await delay();
        this.profile.set(this.mockProfile(month));
        return;
      }
      const response = await this.call((headers) => this.restaurantClient.me({ month }, headers));
      const payload = response.payload;
      if (!payload) throw new Error('Resposta de /restaurants/me sem payload.');
      this.profile.set(
        toProfile(payload.restaurant.name, payload.restaurant.taxRegime, payload.tax),
      );
    } finally {
      this.loading.set(false);
    }
  }

  /** Define o regime tributário (decide o cálculo do imposto no DRE). */
  async updateTaxRegime(taxRegime: TaxRegimeKey): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mockState.taxRegime = taxRegime;
      await this.refresh();
      return;
    }
    await this.call((headers) =>
      this.restaurantClient.updateMe({ taxRegime: REGIME_TO_LIB[taxRegime] }, headers),
    );
    await this.refresh();
  }
}
