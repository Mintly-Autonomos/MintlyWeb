import { signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

describe('Movimentações: sem "vazio" falso antes de carregar (relatório U.2)', () => {
  function montar(estado: { loaded: boolean; loading: boolean }) {
    const vazio = { refresh: vi.fn(() => new Promise<void>(() => undefined)) };
    TestBed.configureTestingModule({
      providers: [
        // O componente consulta o perfil (problemas 23/11): sem o falso, o AuthService de verdade pede a URL da API.
        { provide: AuthService, useValue: { podeMudarCadastros: () => true, meuId: () => null } },
        provideRouter([]),
        {
          provide: MovimentacoesService,
          useValue: {
            ...vazio,
            movements: signal([]),
            loading: signal(estado.loading),
            loaded: signal(estado.loaded),
          },
        },
        { provide: ContasService, useValue: { ...vazio, accounts: signal([]) } },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        { provide: CategoriasService, useValue: { ...vazio, categories: signal([]) } },
      ],
    });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { root, text: (root.textContent ?? '').replace(/\s+/g, ' ') };
  }

  it('antes da primeira carga mostra o esqueleto, não "ainda não registrou" nem "nenhuma encontrada"', () => {
    const { root, text } = montar({ loaded: false, loading: false });
    expect(root.querySelector('[data-testid="lista-carregando"]')).not.toBeNull();
    expect(text).not.toContain('Você ainda não registrou movimentações');
    expect(text).not.toContain('Nenhuma movimentação encontrada');
  });

  it('carregando: esqueleto', () => {
    const { root } = montar({ loaded: true, loading: true });
    expect(root.querySelector('[data-testid="lista-carregando"]')).not.toBeNull();
  });

  it('carregou e não há nada: aí sim o estado vazio com os atalhos', () => {
    const { root, text } = montar({ loaded: true, loading: false });
    expect(root.querySelector('[data-testid="lista-carregando"]')).toBeNull();
    expect(text).toContain('Você ainda não registrou movimentações');
  });
});
