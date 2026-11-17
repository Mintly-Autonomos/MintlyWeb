import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ContasService } from '../../services/contas.service';
import { CategoriasService } from '../../services/categorias.service';
import { ToastService } from '../../shared/toast.service';
import { reportsGuard } from '../../guards/auth.guard';
import { AceitarConviteComponent } from './aceitar-convite.component';
import { ContasComponent } from '../contas/contas.component';
import { CategoriasComponent } from '../categorias/categorias.component';

// E.1 e E.3 do relatório Sweetie Bel: aceitar o convite e o que o perfil Operação vê.

declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

describe('AuthService: nível de acesso da sessão (E.3)', () => {
  let auth: AuthService;
  const entrar = (acesso?: string) =>
    (
      auth as unknown as { persistTokens(a: string, r: string | null, u: unknown): void }
    ).persistTokens('access', 'refresh', {
      nome: 'Caio',
      email: 'caio@teste.com',
      ...(acesso ? { acesso } : {}),
    });

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    auth = TestBed.inject(AuthService);
  });

  it('sessão sem nível (de antes dos perfis) vale como dono', () => {
    entrar();
    expect(auth.acesso()).toBe('owner');
    expect(auth.podeVerRelatorios()).toBe(true);
    expect(auth.podeMudarCadastros()).toBe(true);
  });

  it('Operação não vê relatórios nem muda cadastros; Gerente pode', () => {
    entrar('operations');
    expect([auth.podeVerRelatorios(), auth.podeMudarCadastros()]).toEqual([false, false]);
    auth.setAccessLevel('manager' as never);
    expect([auth.podeVerRelatorios(), auth.podeMudarCadastros()]).toEqual([true, true]);
    const salvo = JSON.parse(
      sessionStorage.getItem('mintly-user') ?? localStorage.getItem('mintly-user') ?? '{}',
    );
    expect(salvo.acesso).toBe('manager');
  });
});

describe('reportsGuard (E.3)', () => {
  const run = (pode: boolean) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { podeVerRelatorios: () => pode } },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      reportsGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as boolean | UrlTree;
  };

  it('quem pode ver relatórios passa', () => {
    expect(run(true)).toBe(true);
  });

  it('Operação vai para Movimentações', () => {
    const r = run(false);
    expect(TestBed.inject(Router).serializeUrl(r as UrlTree)).toBe('/movimentacoes');
  });
});

describe('Aceitar convite (E.1)', () => {
  function montar(opts: { token?: string; preview?: 'ok' | 'invalido'; aceite?: 'ok' | 'erro' }) {
    const auth = {
      invitePreview: vi.fn(() =>
        opts.preview === 'invalido'
          ? Promise.reject(new Error('401'))
          : Promise.resolve({
              name: 'Caio Souza',
              email: 'caio@teste.com',
              restaurantName: 'Doceria Bel',
              expiresAt: '2026-11-24',
            }),
      ),
      acceptInvite: vi.fn(() =>
        opts.aceite === 'erro'
          ? Promise.reject({
              response: { status: 401, data: { message: 'Convite inválido ou vencido.' } },
            })
          : Promise.resolve(),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(
                opts.token === undefined
                  ? { token: 'tok' }
                  : opts.token
                    ? { token: opts.token }
                    : {},
              ),
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AceitarConviteComponent);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const root = fixture.nativeElement as HTMLElement;
    const q = (id: string) => root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const type = async (id: string, value: string) => {
      const el = q(id) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await settle();
    };
    return { fixture, root, q, settle, type, auth, navigate };
  }

  it('mostra para quem é o convite e o restaurante', async () => {
    const { root, q, settle, auth } = montar({});
    await settle();
    expect(auth.invitePreview).toHaveBeenCalledWith('tok');
    expect(root.textContent).toContain('Olá, Caio');
    expect(root.textContent).toContain('Doceria Bel');
    expect(q('convite-para')!.textContent).toContain('caio@teste.com');
  });

  it('link sem token ou já usado mostra que o convite não vale e não pede senha', async () => {
    for (const opts of [{ token: '' }, { preview: 'invalido' as const }]) {
      TestBed.resetTestingModule();
      const { q, settle } = montar(opts);
      await settle();
      expect(q('convite-invalido')).not.toBeNull();
      expect(q('convite-form')).toBeNull();
    }
  });

  it('só envia com senha forte e confirmada; depois vai ao login com o e-mail', async () => {
    const { q, settle, type, auth, navigate } = montar({});
    await settle();
    const botao = () => q('convite-enviar') as HTMLButtonElement;
    await type('convite-senha', 'fraca');
    expect(botao().disabled).toBe(true);
    await type('convite-senha', 'Func12345');
    await type('convite-confirma', 'Func1234');
    expect(botao().disabled).toBe(true);
    await type('convite-confirma', 'Func12345');
    expect(botao().disabled).toBe(false);
    botao().click();
    await settle();
    expect(auth.acceptInvite).toHaveBeenCalledWith('tok', 'Func12345', 'Func12345');
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { convite: 'ok', email: 'caio@teste.com' },
    });
  });

  it('erro da API aparece na tela e não sai dela', async () => {
    const { root, q, settle, type, navigate } = montar({ aceite: 'erro' });
    await settle();
    await type('convite-senha', 'Func12345');
    await type('convite-confirma', 'Func12345');
    (q('convite-enviar') as HTMLButtonElement).click();
    await settle();
    expect(root.textContent).toContain('Convite inválido ou vencido.');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('Telas de cadastro no perfil Operação (E.3)', () => {
  const providers = (pode: boolean) => [
    provideRouter([]),
    { provide: AuthService, useValue: { podeMudarCadastros: signal(pode) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
  ];

  it('Contas: Operação só consulta (sem "Nova conta", sem editar e sem saldo inicial)', () => {
    for (const pode of [false, true]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ...providers(pode),
          {
            provide: ContasService,
            useValue: {
              accounts: signal([
                {
                  id: 'a1',
                  name: 'Caixa',
                  type: 'Cash Register',
                  active: true,
                  isDefault: true,
                  balance: 0,
                  predictedBalance: 0,
                  history: [],
                },
              ]),
              loading: signal(false),
              refresh: vi.fn().mockResolvedValue(undefined),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(ContasComponent);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const textos = Array.from(root.querySelectorAll('button')).map((b) => b.textContent?.trim());
      expect(textos.some((t) => t?.includes('Nova conta'))).toBe(pode);
      expect(!!root.querySelector('[title="Editar"]')).toBe(pode);
      expect(!!root.querySelector('[title="Saldo inicial"]')).toBe(pode);
      expect(!!root.querySelector('[data-testid="somente-leitura"]')).toBe(!pode);
    }
  });

  it('Categorias: Operação não cria nem edita', () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers(false),
        {
          provide: CategoriasService,
          useValue: {
            categories: signal([
              {
                id: 'c1',
                name: 'Embalagens',
                type: 'expense',
                active: true,
                subcategories: [],
                usage: 0,
              },
            ]),
            loading: signal(false),
            refresh: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CategoriasComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const textos = Array.from(root.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(textos.some((t) => t?.includes('Nova categoria'))).toBe(false);
    expect(root.querySelector('[data-testid="somente-leitura"]')).not.toBeNull();
  });
});
