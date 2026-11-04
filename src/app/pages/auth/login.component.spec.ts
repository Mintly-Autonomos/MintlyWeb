import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService, SavedAccount } from '../../services/auth.service';

describe('LoginComponent — conta lembrada neste aparelho', () => {
  function render(saved: SavedAccount | null) {
    const savedAccount = signal<SavedAccount | null>(saved);
    const auth = {
      savedAccount: savedAccount.asReadonly(),
      login: vi.fn(() => Promise.resolve()),
      forgetSavedAccount: vi.fn(() => savedAccount.set(null)),
      consumeReturnUrl: vi.fn(() => null),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    const campo = (name: string) => root.querySelector<HTMLInputElement>(`input[name=${name}]`);
    const digitar = async (name: string, value: string) => {
      // O ngModel registra o campo de forma assíncrona: espera antes de digitar.
      await fixture.whenStable();
      const el = campo(name)!;
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const enviar = async () => {
      root.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, root, text, campo, digitar, enviar, auth };
  }

  const davi: SavedAccount = {
    email: 'davi@teste.com',
    nome: 'Davi Lee',
    avatarDataUrl: 'data:image/png;base64,AAA',
  };

  it('sem conta lembrada: o login completo (e-mail, senha e "Manter conectado")', () => {
    const { root, campo, text } = render(null);
    expect(campo('email')).not.toBeNull();
    expect(campo('password')).not.toBeNull();
    expect(campo('remember')).not.toBeNull();
    expect(root.querySelector('[data-testid=conta-salva]')).toBeNull();
    expect(text()).toContain('Acesse sua conta para continuar');
  });

  it('com conta lembrada: mostra quem é, com a foto, e pede só a senha', () => {
    const { root, campo, text } = render(davi);
    const cartao = root.querySelector('[data-testid=conta-salva]');
    expect(cartao?.textContent).toContain('Davi Lee');
    // O e-mail aparece só em parte; o inteiro não vai para a tela.
    expect(cartao?.querySelector('[data-testid=email-parcial]')?.textContent?.trim()).toBe(
      'da***@teste.com',
    );
    expect(cartao?.textContent).not.toContain('davi@teste.com');
    expect(cartao?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(campo('email')).toBeNull();
    expect(campo('remember')).toBeNull();
    expect(campo('password')).not.toBeNull();
    expect(text()).toContain('Digite sua senha para continuar');
  });

  it('sem foto salva não há ícone', () => {
    const { root } = render({ email: 'davi@teste.com', nome: 'Davi Lee' });
    expect(root.querySelector('[data-testid=conta-salva]')?.querySelector('img')).toBeNull();
    expect(root.querySelector('[data-testid=conta-salva]')?.textContent).toContain('Davi Lee');
  });

  it('digitando a senha entra direto com a conta lembrada, sem pedir o e-mail', async () => {
    const { digitar, enviar, auth } = render(davi);
    await digitar('password', 'SenhaSecreta#1');
    await enviar();
    expect(auth.login).toHaveBeenCalledWith('davi@teste.com', 'SenhaSecreta#1', true);
  });

  it('sem a senha não tenta entrar e pede a senha', async () => {
    const { enviar, auth, text } = render(davi);
    await enviar();
    expect(auth.login).not.toHaveBeenCalled();
    expect(text()).toContain('Digite sua senha para continuar.');
  });

  it('senha errada: mostra o erro e continua na conta lembrada', async () => {
    const { digitar, enviar, auth, text, root } = render(davi);
    auth.login.mockRejectedValueOnce({ response: { status: 401, data: {} } });
    await digitar('password', 'errada');
    await enviar();
    expect(text()).toContain('Não conseguimos entrar com esses dados');
    expect(root.querySelector('[data-testid=conta-salva]')).not.toBeNull();
  });

  it('"Usar outra conta" esquece a conta e volta ao login completo', async () => {
    const { fixture, root, campo, auth } = render(davi);
    root.querySelector<HTMLButtonElement>('[data-testid=usar-outra-conta]')!.click();
    fixture.detectChanges();
    expect(auth.forgetSavedAccount).toHaveBeenCalled();
    expect(root.querySelector('[data-testid=conta-salva]')).toBeNull();
    expect(campo('email')).not.toBeNull();
    expect(campo('remember')).not.toBeNull();
  });

  it('login completo continua enviando e-mail, senha e a escolha de manter conectado', async () => {
    const { digitar, enviar, auth, fixture, campo } = render(null);
    await digitar('email', 'alice@teste.com');
    await digitar('password', 'abc123');
    await fixture.whenStable();
    const caixa = campo('remember')!;
    caixa.click();
    fixture.detectChanges();
    await enviar();
    expect(auth.login).toHaveBeenCalledWith('alice@teste.com', 'abc123', true);
  });
});
