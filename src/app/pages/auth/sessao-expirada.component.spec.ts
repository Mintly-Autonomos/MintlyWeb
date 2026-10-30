import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SessaoExpiradaComponent } from './sessao-expirada.component';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

describe('SessaoExpiradaComponent', () => {
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

  it('um motivo desconhecido cai no texto padrão', () => {
    expect(render({ motivo: 'qualquer' })).toContain('Sua sessão expirou');
  });
});
