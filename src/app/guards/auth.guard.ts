import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Relatórios (E.3): o perfil Operação não os vê. Quem não pode vai para Movimentações (a API recusaria os
 * dados de qualquer jeito).
 */
export const reportsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.podeVerRelatorios() ? true : inject(Router).createUrlTree(['/movimentacoes']);
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/auth/login']);
};

/**
 * "Sua sessão expirou" só faz sentido para quem tinha sessão: a que acabou de ser recusada pela API, ou o
 * encerramento por inatividade (`?motivo=inatividade`). Quem apenas chegou ao site sem entrar vai para o login.
 */
export const sessionExpiredGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (route.queryParamMap.get('motivo') === 'inatividade') return true;
  return auth.consumeSessionEnded() ? true : router.createUrlTree(['/auth/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/']);
};
