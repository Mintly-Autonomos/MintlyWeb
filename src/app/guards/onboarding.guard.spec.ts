import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { RestauranteService } from '../services/restaurante.service';
import { onboardingGuard } from './onboarding.guard';

describe('onboardingGuard', () => {
  let isOnboardingPending: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    isOnboardingPending = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RestauranteService, useValue: { isOnboardingPending } },
      ],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      onboardingGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  it('onboarding pendente (primeiro acesso vazio): leva ao onboarding', async () => {
    isOnboardingPending.mockResolvedValue(true);
    const result = await run();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/auth/onboarding');
  });

  it('onboarding já feito, ou restaurante antigo (sem o campo): entra no app', async () => {
    isOnboardingPending.mockResolvedValue(false);
    expect(await run()).toBe(true);
  });
});
