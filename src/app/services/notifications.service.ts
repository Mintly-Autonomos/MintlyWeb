import { Injectable, computed, inject } from '@angular/core';
import { CardapioService, PratoAlerta } from './cardapio.service';
import { mesesParado } from './cardapio.builder';
import { formatBRL } from '../shared/format';

export interface AppNotification {
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

  readonly notifications = computed<AppNotification[]>(() =>
    this.cardapio.alertas().map((a) => this.toNotification(a)),
  );
  readonly count = computed(() => this.notifications().length);

  private toNotification(a: PratoAlerta): AppNotification {
    const meses = mesesParado(a.daysSinceReview);
    return {
      id: a.id,
      title: `${a.name} sem reajuste há ${meses} ${meses === 1 ? 'mês' : 'meses'}`,
      description: `O preço está parado em ${formatBRL(a.price)} desde então. Vale revisar se ainda cobre o custo atual dos ingredientes.`,
      itemName: a.name,
      actionLabel: 'Rever preço',
      actionRoute: '/previsoes',
      actionQueryParams: { tab: 'cardapio', item: a.id },
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
