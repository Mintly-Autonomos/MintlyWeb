import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SessaoExpiradaComponent } from './sessao-expirada.component';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

// A lib lê a URL da API ao instanciar os clients (o componente injeta o AuthService). Sem isto o teste
// só passava se outro arquivo tivesse definido a variável antes — dependia da ordem de execução.
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

describe('SessaoExpiradaComponent', () => {
  beforeEach(() => localStorage.removeItem('mintly-return-url'));

  function render(params: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(SessaoExpiradaComponent);
    fixture.detectChanges();
    return norm((fixture.nativeElement as HTMLElement).textContent);
  }

  it('por inatividade: diz isso, quantos minutos e só oferece entrar de novo', () => {
    const text = render({ motivo: 'inatividade' });
    expect(text).toContain('Sessão encerrada por inatividade');
    expect(text).toContain('30 minutos sem usar o Mintly');
    expect(text).toContain('Entrar novamente');
    expect(text).not.toContain('Esqueci minha senha');
  });

  it('sem motivo (token vencido): mantém o texto de sessão expirada e o "Esqueci minha senha"', () => {
    const text = render();
    expect(text).toContain('Sua sessão expirou');
    expect(text).not.toContain('por inatividade');
    expect(text).toContain('Esqueci minha senha');
  });

  it('token vencido: não fala em inatividade e diz que precisa entrar de novo', () => {
    const text = render();
    expect(text).toContain('Por segurança, precisamos que você entre de novo.');
    expect(text).not.toContain('sem atividade');
    expect(text).not.toContain('volta para a tela');
  });

  it('com uma tela guardada, avisa que depois de entrar volta para onde estava', () => {
    localStorage.setItem('mintly-return-url', JSON.stringify({ url: '/custos', at: Date.now() }));
    expect(render()).toContain('Depois de entrar, você volta para a tela em que estava.');
  });

  it('por inatividade e com tela guardada: o mesmo aviso', () => {
    localStorage.setItem('mintly-return-url', JSON.stringify({ url: '/custos', at: Date.now() }));
    expect(render({ motivo: 'inatividade' })).toContain('você volta para a tela em que estava');
  });

  it('um motivo desconhecido cai no texto padrão', () => {
    expect(render({ motivo: 'qualquer' })).toContain('Sua sessão expirou');
  });
});
