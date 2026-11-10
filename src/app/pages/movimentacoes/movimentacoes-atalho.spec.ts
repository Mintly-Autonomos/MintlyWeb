import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

interface Interno {
  form(): { type: string };
  creating(): boolean;
}

describe('Movimentações: atalho ?nova= (vindo dos estados vazios)', () => {
  function montar(query: Record<string, string>) {
    const vazio = { refresh: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
        {
          provide: MovimentacoesService,
          useValue: { ...vazio, movements: signal([]), loading: signal(false) },
        },
        { provide: ContasService, useValue: { ...vazio, accounts: signal([]) } },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        { provide: CategoriasService, useValue: { ...vazio, categories: signal([]) } },
      ],
    });
    TestBed.overrideComponent(MovimentacoesComponent, { set: { template: '', imports: [] } });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    return { c: fixture.componentInstance as unknown as Interno, navigate };
  }

  it('?nova=saida abre o formulário de nova saída e limpa o endereço', () => {
    const { c, navigate } = montar({ nova: 'saida' });
    expect(c.creating()).toBe(true);
    expect(c.form().type).toBe('expense');
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { nova: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('?nova=entrada abre o formulário de nova entrada', () => {
    const { c } = montar({ nova: 'entrada' });
    expect(c.creating()).toBe(true);
    expect(c.form().type).toBe('income');
  });

  it('sem o parâmetro (ou com valor desconhecido) a tela abre normal, sem formulário', () => {
    expect(montar({}).c.creating()).toBe(false);
    TestBed.resetTestingModule();
    expect(montar({ nova: 'qualquer' }).c.creating()).toBe(false);
  });
});
