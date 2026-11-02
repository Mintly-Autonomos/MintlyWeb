import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { sessionExpiredGuard } from './auth.guard';

describe('sessionExpiredGuard ("Sua sessão expirou" só para quem tinha sessão)', () => {
  let ended: boolean;

  beforeEach(() => {
    ended = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            consumeSessionEnded: () => {
              const value = ended;
              ended = false;
              return value;
            },
          },
        },
      ],
    });
  });

  const run = (query: Record<string, string> = {}) =>
    TestBed.runInInjectionContext(() =>
      sessionExpiredGuard(
        { queryParamMap: convertToParamMap(query) } as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    ) as boolean | UrlTree;

  const urlOf = (r: boolean | UrlTree) => TestBed.inject(Router).serializeUrl(r as UrlTree);

  it('visitante que só chegou ao site: vai para o login (não vê aviso de expiração)', () => {
    expect(urlOf(run())).toBe('/auth/login');
  });

  it('uma sessão acabou de ser recusada pela API: mostra "sessão expirou"', () => {
    ended = true;
    expect(run()).toBe(true);
  });

  it('só uma vez: recarregar a tela depois leva ao login', () => {
    ended = true;
    expect(run()).toBe(true);
    expect(urlOf(run())).toBe('/auth/login');
  });

  it('encerramento por inatividade (motivo=inatividade) sempre mostra', () => {
    expect(run({ motivo: 'inatividade' })).toBe(true);
  });

  it('outro motivo qualquer na URL não abre a tela', () => {
    expect(urlOf(run({ motivo: 'qualquer' }))).toBe('/auth/login');
  });
});
