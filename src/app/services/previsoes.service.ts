import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ImpostoMes, SEM_IMPOSTO, impostoDoResultado } from '../shared/imposto-mes';
import { apiErrorInfo } from '../shared/api-error';
import { CategoriasService } from './categorias.service';
import { ContasService } from './contas.service';
import { FluxoCaixaService } from './fluxo-caixa.service';
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
  private fluxo = inject(FluxoCaixaService);
  private reportClient = inject(MintlyClientService).client.reportClient;
  private restaurantClient = inject(MintlyClientService).client.restaurantClient;

  readonly base = signal<PrevBase>(baseVazia());
  readonly loading = signal(false);
  /** Já terminou de carregar ao menos uma vez: antes disso a tela mostra o esqueleto, não um "vazio" falso. */
  readonly loaded = signal(false);
  /**
   * Saldo do Fluxo de caixa (só o que já está lançado) no fim de cada dia, de hoje (índice 0) a 90 dias.
   * É a mesma conta do Fluxo e da Visão Geral; null = não deu para consultar.
   */
  readonly saldoLancado = signal<number[] | null>(null);

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
    return typeof err === 'object' && err !== null && apiErrorInfo(err).status === 401;
  }

  /** Imposto do mês pelo Resultado: alíquota no Simples, DAS fixo no MEI (o mesmo das outras telas). */
  private async taxRatio(month: string): Promise<ImpostoMes> {
    if (environment.useMocks) return { aliquota: MOCK_TAX_RATIO, fixoMes: 0 };
    try {
      const res = await this.call((headers) => this.reportClient.result({ month }, headers));
      return impostoDoResultado(res.payload);
    } catch {
      // O imposto é um detalhe: sem o DRE a previsão segue sem esse desconto.
      return SEM_IMPOSTO;
    }
  }

  /** Fração variável da saída pelo comportamento da categoria (fixa 0, variável 1, mista 0,5). */
  private variavelDe(m: Movement): number {
    const behavior = this.categorias.categories().find((c) => c.id === m.categoryId)?.behavior;
    return behavior === 'variable' ? 1 : behavior === 'mixed' ? 0.5 : 0;
  }

  private naoOperacional(m: Movement): boolean {
    return (
      this.categorias.categories().find((c) => c.id === m.categoryId)?.nature === 'non-operational'
    );
  }

  private toPrev(m: Movement): PrevMov {
    const pendente = m.status === 'pending';
    const entrada = m.type === 'income';
    return {
      tipo: entrada ? 'in' : 'out',
      date: pendente ? (m.dueDate ?? m.date) : (m.settledAt ?? m.dueDate ?? m.date),
      valor: entrada ? (m.net ?? m.value) : m.value,
      ...(entrada ? { bruto: m.value } : {}),
      pendente,
      variavel: entrada ? 0 : this.variavelDe(m),
      aVista: !pendente && (m.dueDate === null || m.dueDate <= m.date),
      lancamento: m.date,
      prazo: m.dueDate && m.dueDate > m.date ? diasEntre(m.date, m.dueDate) : 0,
      naoOperacional: this.naoOperacional(m),
    };
  }

  /** P.4: carga semanal de cada pessoa da equipe (Minha conta → Restaurante). `null` = não informada. */
  readonly equipe = signal<{ nome: string; horasSemana: number }[] | null>(null);

  private async carregarEquipe(): Promise<void> {
    if (environment.useMocks) return;
    try {
      const res = await this.call((headers) => this.restaurantClient.me({}, headers));
      const team = res.payload?.restaurant.team;
      this.equipe.set(
        team ? team.map((p) => ({ nome: p.name, horasSemana: p.weeklyHours })) : null,
      );
    } catch {
      // A equipe é um extra: sem ela a recomendação de contratação só fica oculta.
      this.equipe.set(null);
    }
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [, , , fluxo] = await Promise.all([
        this.movimentacoes.refresh(),
        this.categorias.refresh(),
        this.contas.refresh(),
        this.fluxo.fetchReport(90).catch(() => null),
        this.carregarEquipe(),
      ]);
      this.saldoLancado.set(fluxo ? fluxo.projection.map((p) => p.balance) : null);
      const hoje = hojeIso();
      // Mesmo caixa de hoje do Fluxo e da Visão Geral; sem o relatório, a soma dos saldos das contas.
      const caixaHoje =
        fluxo?.cashToday ??
        this.contas
          .accounts()
          .filter((a) => a.active)
          .reduce((s, a) => s + a.balance, 0);
      const movs = this.movimentacoes
        .movements()
        .filter((m) => m.status !== 'cancelled')
        .map((m) => this.toPrev(m));
      const imposto = await this.taxRatio(hoje.slice(0, 7));
      this.base.set(buildBase(movs, caixaHoje, imposto.aliquota, hoje, imposto.fixoMes));
    } finally {
      this.loading.set(false);
      this.loaded.set(true);
    }
  }
}

export { PASSADO };

/** Dias entre duas datas "AAAA-MM-DD" (sem fuso). */
function diasEntre(de: string, ate: string): number {
  const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}
