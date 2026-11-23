import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ImpostoMes, SEM_IMPOSTO, impostoDoResultado } from '../shared/imposto-mes';
import { apiErrorInfo } from '../shared/api-error';
import { CategoriasService } from './categorias.service';
import { MintlyClientService } from './mintly-client.service';
import { MovimentacoesService, Movement } from './movimentacoes.service';
import { CardapioService } from './cardapio.service';
import {
  PeriodKey,
  ReceitaMov,
  ReceitasDataset,
  buildReceitas,
  hoje,
  resolveWindow,
} from './receitas.builder';

export type { PeriodKey, ReceitasDataset, ItemReceita } from './receitas.builder';
export { FAIXAS, DIAS_SEMANA } from './receitas.builder';

/** Imposto sobre venda assumido no modo mock (o DRE real só existe com o back). */
const MOCK_TAX_RATIO = 0.06;

/**
 * Receitas = entradas já recebidas em Movimentações. Não há endpoint próprio: os lançamentos
 * (e os nomes de categoria/subitem) vêm dos services de Movimentações e Categorias, e só o
 * imposto sobre venda vem do DRE do mês (`/reports/result`).
 */
@Injectable({ providedIn: 'root' })
export class ReceitasService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private movimentacoes = inject(MovimentacoesService);
  private categorias = inject(CategoriasService);
  private cardapio = inject(CardapioService);
  private reportClient = inject(MintlyClientService).client.reportClient;

  readonly data = signal<ReceitasDataset | null>(null);
  readonly loading = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Mesmo wrapper autenticado dos outros services (401 -> refresh + retry). */
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
    return typeof err === 'object' && err !== null && apiErrorInfo(err).status === 401;
  }

  /** Imposto do mês pelo Resultado: alíquota no Simples, DAS fixo no MEI (o mesmo das outras telas). */
  private async taxRatio(month: string): Promise<ImpostoMes> {
    if (environment.useMocks) return { aliquota: MOCK_TAX_RATIO, fixoMes: 0 };
    try {
      const res = await this.call((headers) => this.reportClient.result({ month }, headers));
      return impostoDoResultado(res.payload);
    } catch {
      // O imposto é um detalhe: sem o DRE a tela ainda mostra as receitas (sem o desconto).
      return SEM_IMPOSTO;
    }
  }

  /** Entrada recebida -> forma usada pelo cálculo; resolve nomes de categoria e subitem. */
  private toReceita(m: Movement): ReceitaMov {
    const cats = this.categorias.categories();
    const cat = cats.find((c) => c.id === m.categoryId);
    const sub = cat?.subcategories.find((s) => s.id === m.subcategoryId);
    const category = cat?.name ?? 'Sem categoria';
    const delivery =
      m.channel === 'delivery' ||
      ((m.channel === null || m.channel === 'shared') && /delivery/i.test(category));
    const canal = m.channel === 'orders' ? 'encomendas' : delivery ? 'delivery' : 'salao';
    return {
      date: m.settledAt ?? m.dueDate ?? m.date,
      gross: m.value,
      net: m.net ?? m.value,
      item: sub?.name ?? m.title,
      category,
      canal,
      payment: m.paymentMethod ?? 'Outros',
      ...(m.items?.length ? { pratos: m.items } : {}),
      saleDate: m.date,
      ...(m.saleTime ? { saleTime: m.saleTime } : {}),
      ...(m.salesCount ? { salesCount: m.salesCount } : {}),
    };
  }

  private naoOperacional(categoryId: string | null): boolean {
    return (
      this.categorias.categories().find((c) => c.id === categoryId)?.nature === 'non-operational'
    );
  }

  async refresh(period: PeriodKey, from?: string, to?: string): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.movimentacoes.refresh(),
        this.categorias.refresh(),
        // O custo dos pratos é só para o "Por lucro" do ranking: sem ele, o resto da tela segue.
        this.cardapio.refreshPratos().catch(() => undefined),
      ]);
      const today = hoje();
      const win = resolveWindow(period, from, to, today);
      const movs = this.movimentacoes
        .movements()
        // Empréstimo, aporte e saldo inicial (categoria 'Não operacional') não são venda.
        .filter(
          (m) =>
            m.type === 'income' && m.status === 'received' && !this.naoOperacional(m.categoryId),
        )
        .map((m) => this.toReceita(m));
      const ratio = await this.taxRatio(win.end.slice(0, 7));
      const custos = new Map(this.cardapio.pratos().map((p) => [p.id, p.cost]));
      this.data.set(buildReceitas(movs, win, ratio, custos));
    } finally {
      this.loading.set(false);
    }
  }
}
