import { SUBSCRIPTION_TIER_LABEL, memberLimitForTier } from 'mintly-lib';
import type { SubscriptionPlanOption, SubscriptionState, SubscriptionTier } from 'mintly-lib';
import { formatBRL } from '../../shared/format';

/** Dinheiro vem da API em centavos inteiros; a tela mostra em reais. */
export function formatCents(cents: number): string {
  return formatBRL(cents / 100);
}

export function tierLabel(tier: SubscriptionTier | null | undefined): string {
  return tier ? SUBSCRIPTION_TIER_LABEL[tier] : '';
}

/**
 * Quantos funcionários (logins ativos, fora o dono) o tipo permite: "Até 5 funcionários com acesso." O número vem
 * da lib, a mesma constante que a API usa para barrar.
 */
export function employeesLimitText(tier: SubscriptionTier): string {
  return `Até ${memberLimitForTier(tier)} funcionários com acesso.`;
}

/**
 * O que cada tipo oferece. O diferencial do Pro é a análise aprimorada por IA; o Básico traz as análises
 * calculadas pelo sistema. Os dois dizem quantos funcionários podem ter acesso.
 */
export function tierBlurb(tier: SubscriptionTier): string {
  return tier === 'pro'
    ? `Tudo do Básico, com as análises do Mintly aprimoradas por IA e recomendações para cada prato do cardápio: subir o preço, reposicionar ou tirar. ${employeesLimitText(tier)}`
    : `Todas as telas e relatórios do Mintly, com as análises calculadas pelo sistema. ${employeesLimitText(tier)}`;
}

/**
 * Aviso de troca de tipo com a assinatura ainda ativa (upgrade OU downgrade): não há desconto nem
 * crédito pelo tempo que sobra, o novo tipo começa a contar HOJE e o restante do atual é perdido.
 * `null` quando não é uma troca (mesmo tipo, vencida ou sem assinatura).
 */
export function tierChangeNotice(
  state: SubscriptionState,
  selected: SubscriptionTier,
): { title: string; description: string } | null {
  if (state.status !== 'active' || !state.tier || state.tier === selected) return null;
  const from = tierLabel(state.tier);
  const to = tierLabel(selected);
  const downgrade = state.tier === 'pro';
  return {
    title: `Você está mudando do ${from} para o ${to}`,
    description:
      `Mudar de plano não dá desconto nem crédito: o tempo que ainda resta do ${from} (até ${fmtEndsAt(state.endsAt)}) ` +
      `é descartado, e o ${to} começa a contar hoje, não quando o ${from} terminaria.` +
      (downgrade
        ? ` Você perde os recursos do Pro a partir do pagamento. O ${to} permite até ${memberLimitForTier(selected)} funcionários ativos: ` +
          'se você tiver mais, os mais recentes ficam inativos (nada é apagado, e você reativa quem quiser quando houver vaga).'
        : ` Você passa a poder ter até ${memberLimitForTier(selected)} funcionários ativos.`),
  };
}

/** E-mail do suporte do Mintly: pedidos de reembolso e dúvidas sobre cobrança vão para lá. */
export const SUPPORT_EMAIL = 'mintly@sptech.school';

export function planLabel(months: number): string {
  return months === 1 ? '1 mês' : `${months} meses`;
}

/** Data limite para leitura ("30/11/2026"). */
export function fmtEndsAt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function planPerMonthLabel(plan: SubscriptionPlanOption): string {
  return `${formatCents(plan.perMonthCents)} por mês · ${plan.days} dias de acesso`;
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
      subtitle: `Plano ${tierLabel(state.tier)} ativo até ${fmtEndsAt(state.endsAt)}. Renovar o mesmo plano soma o novo período ao tempo que resta; trocar de plano começa a contar hoje.`,
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
    description: `O acesso termina em ${fmtEndsAt(state.endsAt)}. Renove agora: renovar o mesmo plano soma o novo período ao que ainda resta; trocar de plano começa a contar hoje.`,
  };
}
