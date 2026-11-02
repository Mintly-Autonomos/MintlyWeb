import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SubscriptionService } from '../services/subscription.service';
import { subscriptionGuard } from './subscription.guard';

describe('subscriptionGuard', () => {
  let active: boolean;
  let loggedIn: boolean;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    active = false;
    loggedIn = true;
    refresh = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { hasActiveSubscription: () => active, isAuthenticated: () => loggedIn },
        },
        { provide: SubscriptionService, useValue: { refresh } },
      ],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  const urlOf = (r: boolean | UrlTree) => TestBed.inject(Router).serializeUrl(r as UrlTree);

  it('sem login: vai para o login e NÃO consulta a API (as guardas rodam em paralelo; o 401 levaria a "sessão expirada")', async () => {
    loggedIn = false;
    expect(urlOf(await run())).toBe('/auth/login');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('assinatura ativa no estado guardado: entra sem consultar a API', async () => {
    active = true;
    expect(await run()).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('o estado guardado diz que não, mas a API diz que está ativa (liberada em outro lugar): entra', async () => {
    refresh.mockResolvedValue({ status: 'active' });
    expect(await run()).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('sem assinatura: vai para a tela de assinatura', async () => {
    refresh.mockResolvedValue({ status: 'none' });
    expect(urlOf(await run())).toBe('/assinatura');
  });

  it('vencida: vai para a tela de assinatura', async () => {
    refresh.mockResolvedValue({ status: 'expired' });
    expect(urlOf(await run())).toBe('/assinatura');
  });

  it('API que não conhece a assinatura (404): não há portão, entra', async () => {
    refresh.mockResolvedValue(null);
    expect(await run()).toBe(true);
  });

  it('não conseguiu conferir (erro de rede): vai para a tela de assinatura, que mostra o erro', async () => {
    refresh.mockRejectedValue(new Error('rede'));
    expect(urlOf(await run())).toBe('/assinatura');
  });
});
