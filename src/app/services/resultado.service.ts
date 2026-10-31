import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryBehavior, TaxRegime } from 'mintly-lib';
import type { ResultReport, ResultQuery, OpexItem, ResultInsight, Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { MintlyClientService } from './mintly-client.service';
import mockResultado from '../mocks/mock_resultado.json';

export type { ResultReport, ResultQuery, OpexItem, ResultInsight };

/**
 * Mock aproximado pra dev local sem a MintlyApi no ar (`environment.useMocks: true`) — mesmo
 * contrato real (`ResultReport`), construído a partir de `mocks/mock_resultado.json`. Não
 * reproduz as regras exatas do back (mês atual × fechado, etc.), só dados plausíveis.
 */
function buildMockReport(): ResultReport {
  const m = mockResultado;
  const current = {
    grossRevenue: m.receitaBruta,
    taxes: m.impostos,
    netRevenue: m.receitaLiquida,
    cmv: m.cmv,
    grossMargin: m.margemBruta,
    operatingExpenses: m.despesasOperacionais,
    netProfit: m.lucroLiquido,
    netMargin: m.lucroLiquido / m.receitaBruta,
  };
  const previous = {
    grossRevenue: m.anterior.receitaBruta,
    taxes: m.anterior.impostos,
    netRevenue: m.anterior.receitaLiquida,
    cmv: m.anterior.cmv,
    grossMargin: m.anterior.margemBruta,
    operatingExpenses: m.anterior.despesasOperacionais,
    netProfit: m.anterior.lucroLiquido,
    netMargin: m.anterior.margemLiquida / 100,
  };
  const delta = (a: number, b: number) => (b === 0 ? null : (a - b) / b);

  const operatingExpenseItems: OpexItem[] = m.despesasDetalhe.map((d) => ({
    categoryId: d.nome,
    name: d.nome,
    kind: d.tipo === 'fixo' && d.nome.toLowerCase().includes('pró-labore') ? 'labor' : 'opex',
    behavior: d.tipo === 'fixo' ? CategoryBehavior.Fixed : CategoryBehavior.Variable,
    amount: d.valor,
    previousAmount: d.anterior,
    delta: delta(d.valor, d.anterior),
    revenuePct: d.valor / current.grossRevenue,
  }));

  const insights: ResultInsight[] = [
    {
      kind: 'profitChanged',
      severity: current.netProfit >= previous.netProfit ? 'positive' : 'warning',
      difference: current.netProfit - previous.netProfit,
      previousProfit: previous.netProfit,
      currentProfit: current.netProfit,
      previousMargin: previous.netMargin,
      currentMargin: current.netMargin,
    },
  ];
  const maiorDespesa = [...operatingExpenseItems].sort((a, b) => b.amount - a.amount)[0];
  if (maiorDespesa) {
    insights.push({
      kind: 'largestOpexItem',
      severity: 'warning',
      name: maiorDespesa.name,
      amount: maiorDespesa.amount,
      revenuePct: maiorDespesa.revenuePct,
    });
  }

  return {
    referenceMonth: m.refLabel,
    previousMonth: m.anterior.refLabel,
    current,
    previous,
    deltas: {
      grossRevenue: delta(current.grossRevenue, previous.grossRevenue),
      taxes: delta(current.taxes, previous.taxes),
      netRevenue: delta(current.netRevenue, previous.netRevenue),
      cmv: delta(current.cmv, previous.cmv),
      grossMargin: delta(current.grossMargin, previous.grossMargin),
      operatingExpenses: delta(current.operatingExpenses, previous.operatingExpenses),
      netProfit: delta(current.netProfit, previous.netProfit),
    },
    tax: {
      regime: TaxRegime.SimplesNacionalAnexoI,
      effectiveRate: m.impostos / m.receitaBruta,
      meiMonthlyDas: null,
    },
    operatingExpenseItems,
    breakEven: {
      fixedCosts: m.custosFixos,
      variableCosts: m.custosVariaveis,
      contributionMarginPct: (current.netRevenue - m.custosVariaveis) / current.netRevenue,
      breakEvenRevenue:
        m.custosFixos / ((current.grossRevenue - m.custosVariaveis) / current.grossRevenue),
      reachedOnDay: 16,
    },
    history: m.historico.map((h) => ({
      month: h.mes,
      grossRevenue: h.receita,
      netProfit: h.lucro,
      netMargin: h.margem / 100,
    })),
    insights,
    comparison: { kind: 'fullMonth', untilDay: null },
  };
}

function delay(ms = 380): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class ResultadoService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private reportClient = inject(MintlyClientService).client.reportClient;

  readonly data = signal<ResultReport | null>(null);
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

  async refresh(month?: string): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useMocks) {
        await delay();
        this.data.set(buildMockReport());
        return;
      }
      const query: ResultQuery = { month };
      const response = await this.call((headers) => this.reportClient.result(query, headers));
      if (!response.payload) throw new Error('Resposta de /reports/result sem payload.');
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
