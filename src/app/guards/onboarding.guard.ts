import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RestauranteService } from '../services/restaurante.service';

/**
 * Restaurante recém-cadastrado ainda tem o onboarding pendente (guardado no servidor, não no navegador):
 * antes de usar o app passa por ele, em qualquer aparelho e mesmo depois de sair e entrar. Quem já usava o
 * app não tem nada pendente. Se não der para consultar, não barra ninguém.
 */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const restaurante = inject(RestauranteService);
  const router = inject(Router);
  // Sem login não há o que consultar (e as guardas rodam em paralelo): quem manda para o login é a guarda de login.
  if (!auth.isAuthenticated()) return true;
  return (await restaurante.isOnboardingPending())
    ? router.createUrlTree(['/auth/onboarding'])
    : true;
};
