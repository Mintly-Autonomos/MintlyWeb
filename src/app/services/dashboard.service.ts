import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { OverviewReport, OverviewQuery, OverviewInsight, Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';
import mockDashboard from '../mocks/mock_dashboard.json';

export type { OverviewReport, OverviewQuery, OverviewInsight };

function delay(ms = 380): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock aproximado pra dev local sem a MintlyApi no ar (`environment.useMocks: true`) — mesmo
 * contrato real (`OverviewReport`), construído a partir de `mocks/mock_dashboard.json`. Não
 * reproduz as regras exatas do score (pilares/faixas) — só dados plausíveis.
 */
function buildMockReport(): OverviewReport {
  const s = mockDashboard.summary;
  const hist = mockDashboard.monthlyHistory;
  const netProfitHistory = hist.map((h) => ({ month: h.month, amount: h.lucro }));
  const revenueHistory = hist.map((h) => ({ month: h.month, amount: h.receita }));
  const folego = Math.round(s.cashToday / (s.opex / 30));

  const scoreMargem =
    s.marginPct < 0 ? 0 : s.marginPct < 4 ? 25 : s.marginPct < 8 ? 50 : s.marginPct < 12 ? 75 : 100;
  const scorePrime =
    s.primeCostPct <= 60 ? 100 : s.primeCostPct <= 65 ? 75 : s.primeCostPct <= 70 ? 50 : 25;
  const scoreFolego = folego >= 60 ? 100 : folego >= 30 ? 75 : folego >= 15 ? 50 : 25;
  const variacao = ((s.grossRevenue - s.prevGrossRevenue) / s.prevGrossRevenue) * 100;
  const scoreTendencia = variacao > 2 ? 100 : variacao >= -2 ? 60 : 25;
  const score = Math.round(
    scoreMargem * 0.3 + scoreFolego * 0.3 + scorePrime * 0.25 + scoreTendencia * 0.15,
  );

  const insights: OverviewInsight[] = [
    {
      kind: 'cmvAboveTarget',
      severity: 'warning',
      pct: s.cmvPct / 100,
      targetMax: 0.35,
      impact: 1750,
      basisMonth: '2026-07',
    },
    { kind: 'cashTight', severity: 'warning', date: '2026-07-22', balance: 900 },
  ];
  const biggest = [...mockDashboard.insights].find((i) => i.severity === 'oportunidade');
  if (biggest)
    insights.push({
      kind: 'expenseAnomaly',
      severity: 'warning',
      name: biggest.title,
      categoryName: 'Custos',
      excess: 640,
      pctAbove: 0.1,
    });
  insights.push({ kind: 'breakEvenReached', severity: 'positive', day: 19 });

  return {
    referenceMonth: '2026-07',
    today: '2026-07-31',
    cards: {
      netProfit: {
        amount: s.netProfit,
        delta: (s.netProfit - s.prevNetProfit) / s.prevNetProfit,
        history: netProfitHistory,
      },
      revenue: {
        amount: s.grossRevenue,
        delta: (s.grossRevenue - s.prevGrossRevenue) / s.prevGrossRevenue,
        history: revenueHistory,
      },
      cashToday: {
        amount: s.cashToday,
        realized: hist
          .slice(-7)
          .map((h, i) => ({ date: `2026-07-${25 + i}`, balance: s.cashToday - (6 - i) * 200 })),
      },
      projection: {
        horizon: 30,
        balance: s.cashIn30Days,
        lowest: { date: '2026-08-22', balance: 900 },
        runwayDays: folego,
      },
      cmv: {
        pct: s.cmvPct / 100,
        previousPct: s.prevCmvPct / 100,
        deltaPoints: s.cmvPct - s.prevCmvPct,
        target: { min: 0.28, max: 0.35 },
      },
      primeCost: {
        pct: s.primeCostPct / 100,
        previousPct: (s.primeCostPct - 1.8) / 100,
        deltaPoints: 1.8,
        targetMax: 0.65,
      },
    },
    health: {
      score,
      label: score >= 70 ? 'healthy' : score >= 40 ? 'attention' : 'risk',
      basisMonth: '2026-07',
      pillars: [
        { key: 'netMargin', weight: 0.3, score: scoreMargem, value: s.marginPct / 100 },
        { key: 'runway', weight: 0.3, score: scoreFolego, value: folego },
        { key: 'primeCost', weight: 0.25, score: scorePrime, value: s.primeCostPct / 100 },
        { key: 'revenueTrend', weight: 0.15, score: scoreTendencia, value: variacao / 100 },
      ],
      bands: { risk: 40, attention: 70 },
    },
    insights,
    revenueVsExpense: hist.map((h) => ({
      month: h.month,
      revenue: h.receita,
      expense: h.despesa,
      projected: false,
    })),
    profitWaterfall: {
      grossRevenue: s.grossRevenue,
      taxes: s.taxes,
      cmv: s.cmv,
      operatingExpenses: s.opex,
      netProfit: s.netProfit,
    },
    comparison: { kind: 'fullMonth', untilDay: null },
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private dashboardClient = inject(MintlyClientService).client.dashboardClient;

  readonly data = signal<OverviewReport | null>(null);
  readonly loading = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      // 402: a assinatura venceu com o app aberto — leva à tela de assinatura.
      this.auth.onApiError(err);
      if (this.isUnauthorized(err)) {
        const refreshed = await this.auth.refresh();
        if (refreshed) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { response?: { status?: number } }).response?.status === 401
    );
  }

  async refresh(month?: string): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useMocks) {
        await delay();
        this.data.set(buildMockReport());
        return;
      }
      const query: OverviewQuery = { month };
      const response = await this.call((headers) => this.dashboardClient.overview(query, headers));
      if (!response.payload) throw new Error('Resposta de /dashboard/overview sem payload.');
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
