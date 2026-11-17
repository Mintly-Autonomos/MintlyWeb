import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { ToastService } from '../../shared/toast.service';
import { AuthService } from '../../services/auth.service';
import { CardapioComponent } from './cardapio.component';

interface Interno {
  f: { set(v: { nome: string; categoria: string; preco: string; custo: string }): void };
  podeAdicionar(): boolean;
  margemNegativa(): boolean;
}

describe('Cardápio: novo prato (relatório, seção 10.4)', () => {
  function montar() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { podeMudarCadastros: signal(true) } },
        {
          provide: CardapioService,
          useValue: {
            pratos: signal([]),
            categorias: signal([]),
            loading: signal(false),
            refresh: vi.fn(() => Promise.resolve()),
            create: vi.fn(() => Promise.resolve()),
            errorMessage: String,
          },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    TestBed.overrideComponent(CardapioComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(CardapioComponent);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Interno;
  }

  it('sem nome ou com preço zero, o botão "Adicionar" fica desabilitado', () => {
    const c = montar();
    c.f.set({ nome: '', categoria: '', preco: '10,00', custo: '' });
    expect(c.podeAdicionar()).toBe(false);
    c.f.set({ nome: 'Brigadeiro', categoria: '', preco: '0', custo: '' });
    expect(c.podeAdicionar()).toBe(false);
    c.f.set({ nome: 'Brigadeiro', categoria: '', preco: '6,00', custo: '' });
    expect(c.podeAdicionar()).toBe(true);
  });

  it('custo maior que o preço avisa que cada venda dá prejuízo', () => {
    const c = montar();
    c.f.set({ nome: 'Brigadeiro', categoria: '', preco: '6,00', custo: '7,50' });
    expect(c.margemNegativa()).toBe(true);
    c.f.set({ nome: 'Brigadeiro', categoria: '', preco: '6,00', custo: '2,05' });
    expect(c.margemNegativa()).toBe(false);
  });
});
