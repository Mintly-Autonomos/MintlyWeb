import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

describe('AuthService — nome do restaurante no menu da conta', () => {
  let auth: AuthService;

  /** O login devolve o usuário sem o nome do restaurante (só o cadastro devolve). */
  const entrarSemNomeDoRestaurante = () =>
    (
      auth as unknown as { persistTokens(a: string, r: string | null, u: unknown): void }
    ).persistTokens('access', 'refresh', {
      nome: 'Davi Lee',
      email: 'davi@teste.com',
      restaurantId: 'rest-1',
    });

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    auth = TestBed.inject(AuthService);
  });

  it('guarda o nome do restaurante no usuário e na sessão (sobrevive a recarregar)', () => {
    entrarSemNomeDoRestaurante();
    expect(auth.currentUser()?.empresa).toBeUndefined();

    auth.setCompanyName('  Cantina do Davi ');
    expect(auth.currentUser()?.empresa).toBe('Cantina do Davi');
    const salvo = JSON.parse(
      sessionStorage.getItem('mintly-user') ?? localStorage.getItem('mintly-user') ?? '{}',
    );
    expect(salvo.empresa).toBe('Cantina do Davi');
    expect(salvo.nome).toBe('Davi Lee');
  });

  it('nome vazio ou ausente não apaga nem troca o que já existe', () => {
    entrarSemNomeDoRestaurante();
    auth.setCompanyName('Cantina do Davi');
    auth.setCompanyName('');
    auth.setCompanyName('   ');
    auth.setCompanyName(null);
    auth.setCompanyName(undefined);
    expect(auth.currentUser()?.empresa).toBe('Cantina do Davi');
  });

  it('sem ninguém logado não faz nada', () => {
    auth.setCompanyName('Cantina do Davi');
    expect(auth.currentUser()).toBeNull();
  });
});
