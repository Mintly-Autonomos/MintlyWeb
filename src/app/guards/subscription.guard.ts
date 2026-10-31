import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SubscriptionService } from '../services/subscription.service';

/**
 * Sem assinatura válida não se entra no app: leva à tela de assinatura (que também serve para quem
 * nunca assinou e para quem venceu).
 *
 * O estado guardado vale quando diz "ativa". Quando diz o contrário, confere com a API antes de barrar:
 * assim uma assinatura liberada em outro aparelho, ou gravada no banco, vale sem precisar sair e entrar.
 * Se a API não conhece a assinatura (404), não há portão; se não der para conferir, vai para a tela de
 * assinatura, que mostra o erro e deixa tentar de novo.
 */
export const subscriptionGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const subscription = inject(SubscriptionService);
  const router = inject(Router);

  if (auth.hasActiveSubscription()) return true;

  try {
    const overview = await subscription.refresh();
    if (overview === null) return true;
    if (overview.status === 'active') return true;
  } catch {
    /* sem conseguir conferir: a tela de assinatura trata */
  }
  return router.createUrlTree(['/assinatura']);
};
