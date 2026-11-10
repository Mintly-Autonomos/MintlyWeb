import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, RouterLink, provideRouter } from '@angular/router';
import { AuthService, SavedAccount } from '../../services/auth.service';
import { CadastroComponent } from './cadastro.component';
import { EsqueciSenhaComponent } from './esqueci-senha.component';
import { LoginComponent } from './login.component';
import { PrivacidadeComponent } from '../legal/privacidade.component';
import { TermosComponent } from '../legal/termos.component';

const texto = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

describe('Login: caminho para recuperar a senha', () => {
  function render(saved: SavedAccount | null, login = vi.fn(() => Promise.resolve())) {
    const auth = {
      savedAccount: signal<SavedAccount | null>(saved).asReadonly(),
      login,
      forgetSavedAccount: vi.fn(),
      consumeReturnUrl: vi.fn(() => null),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, navigate };
  }

  const linkEsqueci = (fixture: ReturnType<typeof render>['fixture']) =>
    fixture.debugElement.query(By.css('[data-testid=esqueci-senha]')).injector.get(RouterLink);

  it('"Esqueci minha senha" leva o e-mail que a pessoa já digitou', async () => {
    const { fixture, root } = render(null);
    await fixture.whenStable();
    const campo = root.querySelector<HTMLInputElement>('input[name=email]')!;
    campo.value = '  ana@bar.com ';
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(linkEsqueci(fixture).state).toEqual({ email: 'ana@bar.com' });
  });

  it('com a conta lembrada neste aparelho, leva o e-mail dela', () => {
    const { fixture } = render({ email: 'davi@teste.com', nome: 'Davi' });
    expect(linkEsqueci(fixture).state).toEqual({ email: 'davi@teste.com' });
  });

  it('sem e-mail digitado, o link segue sem e-mail (a tela de recuperação abre vazia)', () => {
    const { fixture } = render(null);
    expect(linkEsqueci(fixture).state).toEqual({ email: '' });
  });

  it('excesso de tentativas (429) leva à tela de acesso bloqueado, sem mensagem de senha errada', async () => {
    const login = vi.fn(() => Promise.reject({ response: { status: 429, data: {} } }));
    const { fixture, root, navigate } = render(null, login);
    await fixture.whenStable();
    for (const [name, value] of [
      ['email', 'ana@bar.com'],
      ['password', 'qualquer'],
    ]) {
      const el = root.querySelector<HTMLInputElement>(`input[name=${name}]`)!;
      el.value = value;
      el.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/auth/bloqueado']);
    expect(texto(root)).not.toContain('Não conseguimos entrar');
  });

  it('senha errada (401) mostra o erro e fica no login', async () => {
    const login = vi.fn(() => Promise.reject({ response: { status: 401, data: {} } }));
    const { fixture, root, navigate } = render(null, login);
    await fixture.whenStable();
    for (const [name, value] of [
      ['email', 'ana@bar.com'],
      ['password', 'errada'],
    ]) {
      const el = root.querySelector<HTMLInputElement>(`input[name=${name}]`)!;
      el.value = value;
      el.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(texto(root)).toContain('Não conseguimos entrar com esses dados');
  });
});

describe('Esqueci minha senha', () => {
  afterEach(() => history.replaceState(null, ''));

  function render() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { forgotPassword: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(EsqueciSenhaComponent);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('abre com o e-mail que veio do login (não pede para digitar de novo)', async () => {
    history.replaceState({ email: 'ana@bar.com' }, '');
    const { fixture, root } = render();
    await fixture.whenStable();
    expect(root.querySelector<HTMLInputElement>('input[name=email]')!.value).toBe('ana@bar.com');
    expect(root.querySelector('button[type=submit]')?.hasAttribute('disabled')).toBe(false);
  });

  it('sem e-mail vindo do login, abre vazio', async () => {
    history.replaceState(null, '');
    const { fixture, root } = render();
    await fixture.whenStable();
    expect(root.querySelector<HTMLInputElement>('input[name=email]')!.value).toBe('');
  });

  it('só uma vez "Voltar para o login": o link, sem o botão repetido', () => {
    const { root } = render();
    const voltar = [...root.querySelectorAll('a, button')].filter((e) =>
      (e.textContent ?? '').includes('Voltar para o login'),
    );
    expect(voltar.length).toBe(1);
    expect(voltar[0].tagName).toBe('A');
  });
});

describe('Cadastro: fluxo sem distrações', () => {
  function render() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { signup: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(CadastroComponent);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('não pede foto no cadastro (a foto fica para depois, em Minha conta)', () => {
    const { root } = render();
    expect(root.querySelector('input[type=file]')).toBeNull();
    expect(texto(root)).not.toContain('Adicionar foto');
    expect(texto(root)).not.toContain('foto de perfil');
  });

  it('não tem nenhum link que tire a pessoa do cadastro (nem "Já tem conta?", nem o logo)', () => {
    const { root } = render();
    expect(texto(root)).not.toContain('Já tem conta');
    expect(texto(root)).not.toContain('Fazer login');
    // o logo continua aparecendo, mas sem destino
    expect(root.querySelector('a[aria-label^="Mintly"]')?.getAttribute('href')).toBeNull();
    expect(root.querySelectorAll('a[href]').length).toBe(0);
  });

  it('no último passo, Termos de Uso e Política de Privacidade são links que abrem em outra aba', () => {
    const { fixture, root } = render();
    (fixture.componentInstance as unknown as { step: { set(n: number): void } }).step.set(2);
    fixture.detectChanges();
    const termos = root.querySelector<HTMLAnchorElement>('[data-testid=link-termos]')!;
    const privacidade = root.querySelector<HTMLAnchorElement>('[data-testid=link-privacidade]')!;
    expect(termos.getAttribute('href')).toBe('/termos');
    expect(privacidade.getAttribute('href')).toBe('/privacidade');
    for (const a of [termos, privacidade]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
    // são os únicos links do cadastro e ficam dentro do texto do aceite
    expect(root.querySelectorAll('a[href]').length).toBe(2);
  });
});

describe('Páginas de Termos de Uso e Política de Privacidade', () => {
  it('Termos: título, data, seções numeradas e link para a Política', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TermosComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid=legal-titulo]')?.textContent).toContain(
      'Termos de Uso',
    );
    expect(texto(root)).toContain('Última atualização');
    expect(root.querySelectorAll('section').length).toBeGreaterThanOrEqual(10);
    expect(texto(root)).toContain('Assinatura e pagamento');
    expect(root.querySelector('a[href="/privacidade"]')).not.toBeNull();
  });

  it('Privacidade: título, LGPD, direitos do titular e link para os Termos', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PrivacidadeComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid=legal-titulo]')?.textContent).toContain(
      'Política de Privacidade',
    );
    expect(texto(root)).toContain('LGPD');
    expect(texto(root)).toContain('Seus direitos');
    expect(root.querySelector('a[href="/termos"]')).not.toBeNull();
  });
});
