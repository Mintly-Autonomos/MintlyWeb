import type { SubscriptionPlanOption, SubscriptionState } from 'mintly-lib';
import { formatBRL } from '../../shared/format';

/** Dinheiro vem da API em centavos inteiros; a tela mostra em reais. */
export function formatCents(cents: number): string {
  return formatBRL(cents / 100);
}

export function planLabel(months: number): string {
  return months === 1 ? '1 mês' : `${months} meses`;
}

/** Data limite para leitura ("30/11/2026"). */
export function fmtEndsAt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function planPerMonthLabel(plan: SubscriptionPlanOption): string {
  return `${formatCents(plan.perMonthCents)} por mês`;
}

/** Quanto o plano economiza frente a pagar mês a mês, em reais (só faz sentido com desconto). */
export function planSavingCents(plan: SubscriptionPlanOption): number {
  return plan.listCents - plan.totalCents;
}

/** Frase de abertura da tela de assinatura, conforme a situação da pessoa. */
export function subscriptionHeadline(state: SubscriptionState): {
  title: string;
  subtitle: string;
} {
  if (state.status === 'active') {
    return {
      title: 'Sua assinatura',
      subtitle: `Ativa até ${fmtEndsAt(state.endsAt)}. Renovar agora soma o novo período ao tempo que ainda resta.`,
    };
  }
  if (state.status === 'expired') {
    return {
      title: 'Sua assinatura venceu',
      subtitle: `Ela terminou em ${fmtEndsAt(state.endsAt)}. Escolha um plano para voltar a usar o Mintly.`,
    };
  }
  return {
    title: 'Escolha seu plano',
    subtitle:
      'O Mintly funciona por assinatura. Escolha o período e pague para liberar o acesso à sua conta.',
  };
}

/** Aviso do sino quando faltam 3 dias ou menos. */
export function expiryNoticeText(
  state: SubscriptionState,
): { title: string; description: string } | null {
  if (state.status !== 'active' || !state.expiresSoon || state.daysLeft === null) return null;
  const dias = state.daysLeft === 1 ? '1 dia' : `${state.daysLeft} dias`;
  return {
    title: `Sua assinatura vence em ${dias}`,
    description: `O acesso termina em ${fmtEndsAt(state.endsAt)}. Renove agora: o novo período é somado ao que ainda resta.`,
  };
}
