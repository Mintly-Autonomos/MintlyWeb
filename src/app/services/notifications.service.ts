import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CardapioService, PratoAlerta } from './cardapio.service';
import { expiryNoticeText } from '../pages/assinatura/assinatura.format';
import { mesesParado } from './cardapio.builder';
import { formatBRL } from '../shared/format';

const SUBSCRIPTION_NOTICE_ID = 'subscription-expiring';
const OVERVIEW_NOTICE_ID = 'overview-pending';
const DISMISSED_KEY = 'mintly-sub-notice-dismissed';

export interface AppNotification {
  /** 'price': aviso de preço parado; 'subscription': a assinatura está para vencer; 'overview': há itens em "O que fazer primeiro". */
  kind: 'price' | 'subscription' | 'overview';
  /** Id do prato — o aviso existe enquanto o preço não for revisado. */
  id: string;
  title: string;
  description: string;
  itemName: string;
  actionLabel: string;
  actionRoute: string;
  actionQueryParams: Record<string, string>;
  dismissLabel: string;
}

/**
 * Notificações = pratos com o preço sem revisão há tempo demais (`GET /menu-items/price-alerts`).
 * Não há "lida": o aviso some quando o preço é revisado — mudando o valor ("Rever preço" leva ao
 * prato em Previsões > Meu cardápio) ou dizendo "Não quero mudar". Volta só depois de ~5,5 meses.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private cardapio = inject(CardapioService);
  private auth = inject(AuthService);

  /** Data limite cujo aviso a pessoa dispensou nesta sessão (aparece de novo no próximo acesso). */
  private dismissedFor = signal<string | null>(this.readDismissed());

  /** Quantas recomendações "O que fazer primeiro" a Visão Geral mostrou por último (0 = nada pendente). */
  private recomendacoes = signal(0);
  /** "Agora não" neste acesso: some até a próxima vez que a pessoa entrar. */
  private overviewDispensado = signal(false);

  readonly notifications = computed<AppNotification[]>(() => [
    ...this.overviewNotice(),
    ...this.subscriptionNotice(),
    ...this.cardapio.alertas().map((a) => this.toNotification(a)),
  ]);
  readonly count = computed(() => this.notifications().length);

  /** Chamado pela Visão Geral com o número de recomendações pendentes. */
  setRecomendacoes(total: number): void {
    this.recomendacoes.set(Math.max(0, total));
  }

  dismissOverviewNotice(): void {
    this.overviewDispensado.set(true);
  }

  private overviewNotice(): AppNotification[] {
    const n = this.recomendacoes();
    if (n <= 0 || this.overviewDispensado()) return [];
    return [
      {
        kind: 'overview',
        id: OVERVIEW_NOTICE_ID,
        title: `${n} ${n === 1 ? 'recomendação pendente' : 'recomendações pendentes'} em "O que fazer primeiro"`,
        description:
          'Veja o que precisa de atenção no seu negócio agora. Fica no topo da Visão Geral.',
        itemName: 'O que fazer primeiro',
        actionLabel: 'Ver agora',
        actionRoute: '/visao-geral',
        actionQueryParams: {},
        dismissLabel: 'Agora não',
      },
    ];
  }

  /** Faltando 3 dias ou menos para vencer. No dia do vencimento a pessoa já cai na tela de assinatura. */
  private subscriptionNotice(): AppNotification[] {
    const state = this.auth.subscriptionState();
    const text = expiryNoticeText(state);
    if (!text || this.dismissedFor() === state.endsAt) return [];
    return [
      {
        kind: 'subscription',
        id: SUBSCRIPTION_NOTICE_ID,
        title: text.title,
        description: text.description,
        itemName: 'Assinatura',
        actionLabel: 'Renovar',
        actionRoute: '/assinatura',
        actionQueryParams: {},
        dismissLabel: 'Agora não',
      },
    ];
  }

  /** "Agora não": some até o próximo acesso (não até o vencimento). */
  dismissSubscriptionNotice(): void {
    const endsAt = this.auth.subscriptionState().endsAt;
    this.dismissedFor.set(endsAt);
    try {
      if (endsAt) sessionStorage.setItem(DISMISSED_KEY, endsAt);
    } catch {
      /* sem storage: some só até recarregar */
    }
  }

  private readDismissed(): string | null {
    try {
      return sessionStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  }

  private toNotification(a: PratoAlerta): AppNotification {
    const meses = mesesParado(a.daysSinceReview);
    return {
      kind: 'price',
      id: a.id,
      title: `${a.name} sem reajuste há ${meses} ${meses === 1 ? 'mês' : 'meses'}`,
      description: `O preço está parado em ${formatBRL(a.price)} desde então. Vale revisar se ainda cobre o custo atual dos ingredientes.`,
      itemName: a.name,
      actionLabel: 'Rever preço',
      actionRoute: '/cardapio',
      actionQueryParams: { item: a.id },
      dismissLabel: 'Não quero mudar',
    };
  }

  async refresh(): Promise<void> {
    await this.cardapio.refreshAlertas();
  }

  /** "Não quero mudar": mantém o preço e silencia o aviso. */
  async keepPrice(n: AppNotification): Promise<void> {
    await this.cardapio.keepPrice(n.id);
  }
}
