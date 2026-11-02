import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { RestauranteService } from './restaurante.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

describe('RestauranteService — onboarding (primeiro acesso no servidor)', () => {
  let svc: RestauranteService;
  let me: ReturnType<typeof vi.fn>;
  let completeFirstAccess: ReturnType<typeof vi.fn>;
  let restaurantId: string;

  const answer = (restaurant: Record<string, unknown>) =>
    me.mockResolvedValue({ payload: { restaurant, tax: {} } });

  beforeEach(() => {
    restaurantId = 'rest-1';
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ restaurantId }), getAccessToken: () => 't' },
        },
      ],
    });
    svc = TestBed.inject(RestauranteService);
    me = vi.fn();
    completeFirstAccess = vi.fn().mockResolvedValue({ payload: {} });
    (svc as unknown as { restaurantClient: unknown }).restaurantClient = {
      me,
      completeFirstAccess,
    };
    (svc as unknown as { call: unknown }).call = (fn: (h: unknown) => Promise<unknown>) => fn({});
  });

  it('primeiro acesso VAZIO (null, como o cadastro grava): onboarding pendente', async () => {
    answer({ name: 'Cantina', firstAccessAt: null });
    expect(await svc.isOnboardingPending()).toBe(true);
  });

  it('primeiro acesso preenchido: nada pendente', async () => {
    answer({ name: 'Cantina', firstAccessAt: '2026-11-02T10:00:00.000Z' });
    expect(await svc.isOnboardingPending()).toBe(false);
  });

  it('restaurante antigo (sem o campo): nada pendente, não passa pelo onboarding', async () => {
    answer({ name: 'Cantina' });
    expect(await svc.isOnboardingPending()).toBe(false);
  });

  it('consulta o servidor uma vez por restaurante (a navegação não repete a chamada)', async () => {
    answer({ name: 'Cantina', firstAccessAt: null });
    await svc.isOnboardingPending();
    await svc.isOnboardingPending();
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('outro restaurante na mesma aba consulta de novo', async () => {
    answer({ name: 'A', firstAccessAt: null });
    expect(await svc.isOnboardingPending()).toBe(true);
    restaurantId = 'rest-2';
    answer({ name: 'B', firstAccessAt: '2026-11-02T10:00:00.000Z' });
    expect(await svc.isOnboardingPending()).toBe(false);
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('não consegue consultar: não trava ninguém (nada pendente)', async () => {
    me.mockRejectedValue(new Error('rede'));
    expect(await svc.isOnboardingPending()).toBe(false);
  });

  it('concluir chama o servidor e a consulta seguinte já diz que nada está pendente', async () => {
    answer({ name: 'Cantina', firstAccessAt: null });
    expect(await svc.isOnboardingPending()).toBe(true);
    await svc.completeOnboarding();
    expect(completeFirstAccess).toHaveBeenCalledTimes(1);
    expect(await svc.isOnboardingPending()).toBe(false);
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('concluir sem o servidor confirmar: o erro sobe (a tela avisa e deixa tentar de novo)', async () => {
    completeFirstAccess.mockRejectedValue(new Error('rede'));
    await expect(svc.completeOnboarding()).rejects.toThrow('rede');
  });
});
