import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AiInsightPage, AiInsightText, AiPriceSuggestion, AiUsage, Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { apiErrorInfo } from '../shared/api-error';
import { AuthService } from './auth.service';
import { CardapioService, Prato } from './cardapio.service';
import { diasSemRevisao } from './cardapio.builder';
import { MintlyClientService } from './mintly-client.service';

function delay(ms = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Textos de demonstração (modo `useMocks`): só para ver a tela sem a API e sem gastar a IA. */
const MOCK_TEXTOS: Record<string, { title: string; description: string }> = {
  cashTight: {
    title: 'Seu caixa fica curto mais para o fim do mês',
    description:
      'As contas se juntam e o saldo cai. Vale antecipar um recebimento ou adiar uma compra.',
  },
  expenseAnomaly: {
    title: 'Uma despesa saiu do seu normal',
    description: 'Ela passou do que você costuma gastar. Dê uma olhada antes que vire rotina.',
  },
  breakEvenReached: {
    title: 'Suas contas fixas já estão pagas este mês',
    description: 'A partir de agora, o que você vende é lucro. Bom momento para segurar os custos.',
  },
  cmvAboveTarget: {
    title: 'Os ingredientes estão pesando no seu lucro',
    description: 'O custo dos ingredientes passou do ideal. Revise fornecedores e porções.',
  },
  primeCostAboveTarget: {
    title: 'Ingredientes e equipe passaram do ideal',
    description: 'Juntos, eles consomem mais da sua receita do que o recomendado.',
  },
  taxRegimeNotConfigured: {
    title: 'Falta definir seu regime tributário',
    description: 'Sem ele o imposto do resultado sai zerado. Configure com ajuda do seu contador.',
  },
};

/**
 * IA do Mintly (Claude Haiku, via API): textos dos cards e sugestão de preço. Os textos dos cards NUNCA
 * derrubam a tela: qualquer falha (IA fora do ar, limite do dia, rede) devolve lista vazia e a tela fica com o
 * texto de sempre. A sugestão de preço é pedida pela pessoa, então o erro sobe para a tela mostrar o motivo.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private cardapio = inject(CardapioService);
  private client = inject(MintlyClientService).client;

  /** Chamadas usadas e restantes hoje (`null` até saber). */
  readonly uso = signal<AiUsage | null>(null);

  /** Depois de um 429/503 não insiste nos textos dos cards até recarregar a página. */
  private semTextos = false;

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Chamada autenticada: em 401 renova o token uma vez e tenta de novo. */
  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (apiErrorInfo(err).status === 401 && (await this.auth.refresh())) {
        return await fn(this.headers);
      }
      throw err;
    }
  }

  /** Quantas chamadas restam hoje. Silencioso: sem essa informação a tela só não mostra o contador. */
  async carregarUso(): Promise<void> {
    if (environment.useMocks) {
      this.uso.update((u) => u ?? { limitPerDay: 20, usedToday: 0, remainingToday: 20 });
      return;
    }
    try {
      const res = await this.call((h) => this.client.aiClient.usage(h));
      if (res.payload) this.uso.set(res.payload);
    } catch {
      /* sem contador */
    }
  }

  /**
   * Textos novos dos insights da tela. `atuais` só é usado no modo demonstração (para montar textos dos
   * insights que estão na tela); na API o servidor monta tudo sozinho.
   */
  async textosInsights(
    page: AiInsightPage,
    month?: string,
    atuais: { kind: string }[] = [],
  ): Promise<AiInsightText[]> {
    if (this.semTextos) return [];
    if (environment.useMocks) {
      await delay();
      return atuais.flatMap((a, index) =>
        MOCK_TEXTOS[a.kind] ? [{ index, kind: a.kind, ...MOCK_TEXTOS[a.kind] }] : [],
      );
    }
    try {
      const res = await this.call((h) =>
        this.client.aiClient.insights({ page, ...(month ? { month } : {}) }, h),
      );
      if (res.payload) {
        this.uso.set({
          limitPerDay: res.payload.limitPerDay,
          usedToday: res.payload.usedToday,
          remainingToday: res.payload.remainingToday,
        });
        return res.payload.insights;
      }
      return [];
    } catch (err) {
      const status = apiErrorInfo(err).status;
      if (status === 429 || status === 503) this.semTextos = true;
      return [];
    }
  }

  /**
   * Sugere o aumento ideal do preço de um prato (sem `menuItemId`, a API escolhe o que está há mais tempo sem
   * mudar). Erros sobem (429: acabou o limite do dia; 503: IA fora do ar) para a tela mostrar a mensagem.
   */
  async sugerirPreco(menuItemId?: string): Promise<AiPriceSuggestion> {
    if (environment.useMocks) {
      await delay(900);
      const sugestao = this.sugestaoDeDemonstracao(menuItemId);
      this.uso.update((u) => {
        const usado = Math.min((u?.usedToday ?? 0) + 1, u?.limitPerDay ?? 20);
        const limite = u?.limitPerDay ?? 20;
        return { limitPerDay: limite, usedToday: usado, remainingToday: limite - usado };
      });
      return sugestao;
    }
    const res = await this.call((h) =>
      this.client.aiClient.priceSuggestion(menuItemId ? { menuItemId } : {}, h),
    );
    const sugestao = res.payload;
    if (!sugestao) throw new Error('A IA não devolveu uma sugestão.');
    this.uso.set({
      limitPerDay: sugestao.limitPerDay,
      usedToday: sugestao.usedToday,
      remainingToday: sugestao.remainingToday,
    });
    return sugestao;
  }

  private sugestaoDeDemonstracao(menuItemId?: string): AiPriceSuggestion {
    const ativos = this.cardapio.pratos().filter((p: Prato) => p.active && p.price > 0);
    const agora = new Date();
    const prato = menuItemId
      ? ativos.find((p) => p.id === menuItemId)
      : [...ativos].sort((a, b) => diasSemRevisao(b, agora) - diasSemRevisao(a, agora))[0];
    if (!prato)
      throw new Error('Cadastre pelo menos um prato no cardápio para receber uma sugestão.');
    const sugerido = Math.round(prato.price * 1.1 * 2) / 2; // +10%, em múltiplos de R$ 0,50
    return {
      menuItemId: prato.id,
      name: prato.name,
      currentPrice: prato.price,
      suggestedPrice: sugerido,
      increasePercent: Math.round((sugerido / prato.price - 1) * 1000) / 10,
      reason:
        'O preço está parado há bastante tempo e o prato vende bem. Um ajuste pequeno protege sua margem sem afastar quem já pede.',
      cached: false,
      limitPerDay: 20,
      usedToday: 0,
      remainingToday: 20,
    };
  }
}

/**
 * O texto novo da IA para o insight da posição `index` (e do mesmo `kind`), ou `undefined` para ficar com o
 * texto de sempre. Conferir o `kind` evita trocar o texto de um card por outro se a lista mudou no meio.
 */
export function textoDaIa(
  textos: AiInsightText[],
  index: number,
  kind: string,
): AiInsightText | undefined {
  return textos.find((t) => t.index === index && t.kind === kind);
}
