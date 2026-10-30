import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { apiErrorInfo } from '../shared/api-error';
import { CategoriasService } from './categorias.service';
import { ContasService } from './contas.service';
import { MintlyClientService } from './mintly-client.service';
import { MovimentacoesService, Movement } from './movimentacoes.service';
import { PrevBase, PrevMov, buildBase, PASSADO } from './previsoes.builder';

export type Severity = 'risco' | 'atencao' | 'oportunidade' | 'positivo';
export * from './previsoes.builder';

/** Imposto sobre venda assumido no modo mock (o DRE real só existe com o back). */
const MOCK_TAX_RATIO = 0.06;

const pad = (n: number) => String(n).padStart(2, '0');
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const baseVazia = (): PrevBase => buildBase([], 0, 0, hojeIso());

/**
 * Previsões = lançamentos reais (Movimentações) + saldo das contas + imposto do DRE do mês.
 * Não há endpoint próprio: a projeção é calculada aqui (`previsoes.builder.ts`).
 */
@Injectable({ providedIn: 'root' })
export class PrevisoesService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private movimentacoes = inject(MovimentacoesService);
  private categorias = inject(CategoriasService);
  private contas = inject(ContasService);
  private reportClient = inject(MintlyClientService).client.reportClient;

  readonly base = signal<PrevBase>(baseVazia());
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

  /** Fração de imposto sobre a venda do mês (impostos ÷ receita bruta do DRE); 0 sem regime. */
  private async taxRatio(month: string): Promise<number> {
    if (environment.useMocks) return MOCK_TAX_RATIO;
    try {
      const res = await this.call((headers) => this.reportClient.result({ month }, headers));
      const cur = res.payload?.current;
      return cur && cur.grossRevenue > 0 ? cur.taxes / cur.grossRevenue : 0;
    } catch {
      // O imposto é um detalhe: sem o DRE a previsão segue sem esse desconto.
      return 0;
    }
  }

  /** Fração variável da saída pelo comportamento da categoria (fixa 0, variável 1, mista 0,5). */
  private variavelDe(m: Movement): number {
    const behavior = this.categorias.categories().find((c) => c.id === m.categoryId)?.behavior;
    return behavior === 'variable' ? 1 : behavior === 'mixed' ? 0.5 : 0;
  }

  private toPrev(m: Movement): PrevMov {
    const pendente = m.status === 'pending';
    const entrada = m.type === 'income';
    return {
      tipo: entrada ? 'in' : 'out',
      date: pendente ? (m.dueDate ?? m.date) : (m.settledAt ?? m.dueDate ?? m.date),
      valor: entrada ? (m.net ?? m.value) : m.value,
      pendente,
      variavel: entrada ? 0 : this.variavelDe(m),
      aVista: !pendente && (m.dueDate === null || m.dueDate <= m.date),
    };
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.movimentacoes.refresh(),
        this.categorias.refresh(),
        this.contas.refresh(),
      ]);
      const hoje = hojeIso();
      const caixaHoje = this.contas
        .accounts()
        .filter((a) => a.active)
        .reduce((s, a) => s + a.balance, 0);
      const movs = this.movimentacoes
        .movements()
        .filter((m) => m.status !== 'cancelled')
        .map((m) => this.toPrev(m));
      const ratio = await this.taxRatio(hoje.slice(0, 7));
      this.base.set(buildBase(movs, caixaHoje, ratio, hoje));
    } finally {
      this.loading.set(false);
    }
  }
}

export { PASSADO };
