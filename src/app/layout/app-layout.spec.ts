import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TourService } from '../tutorial/tour.service';
import { AppLayoutComponent } from './app-layout.component';
import { ContaService } from '../services/conta.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

describe('AppLayoutComponent — botão de tutorial ("?")', () => {
  const montar = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    const fixture = TestBed.createComponent(AppLayoutComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const ajuda = el.querySelector<HTMLButtonElement>('button[aria-label="Tutorial desta página"]');
    return { fixture, el, ajuda };
  };

  afterEach(() => {
    TestBed.inject(TourService).stop();
    vi.restoreAllMocks();
  });

  it('fica no topo, ao lado do botão de tema, em qualquer largura', () => {
    const { el, ajuda } = montar();
    const tema = el.querySelector('button[aria-label^="Ativar modo"]') as HTMLButtonElement;
    expect(ajuda).not.toBeNull();
    expect(ajuda!.parentElement).toBe(tema.parentElement);
    expect(ajuda!.classList.contains('hidden')).toBe(false);
    expect(ajuda!.getAttribute('data-tour')).toBe('ajuda');
  });

  it('clicar abre o tutorial da tela atual', () => {
    const { ajuda } = montar();
    const start = vi.spyOn(TestBed.inject(TourService), 'start').mockReturnValue(true);
    ajuda!.click();
    expect(start).toHaveBeenCalledWith(TestBed.inject(Router).url);
  });

  it('o tutorial aparece de verdade: destaca o menu e termina no próprio "?"', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      return [{}] as unknown as DOMRectList;
    });
    window.scrollBy = vi.fn() as unknown as typeof window.scrollBy;
    const { fixture, el, ajuda } = montar();
    ajuda!.click();
    await new Promise((r) => setTimeout(r, 30));
    fixture.detectChanges();

    const cartao = () => el.querySelector('[data-testid="tour-cartao"]') as HTMLElement;
    expect(cartao()).not.toBeNull();
    expect(cartao().textContent).toContain('Menu principal');
    const proximo = () => el.querySelector('[data-testid="tour-proximo"]') as HTMLButtonElement;
    for (let i = 0; i < 4; i++) {
      proximo().click();
      fixture.detectChanges();
    }
    expect(cartao().textContent).toContain('Quer rever?');
    expect(proximo().textContent!.trim()).toBe('Concluir');
  });

  it('abrir o tutorial fecha menus abertos (notificações, conta e gaveta)', () => {
    const { fixture, el, ajuda } = montar();
    const sino = el.querySelector('button[aria-label="Notificações"]') as HTMLButtonElement;
    sino.click();
    fixture.detectChanges();
    expect(sino.getAttribute('aria-expanded')).toBe('true');
    ajuda!.click();
    fixture.detectChanges();
    expect(sino.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('AppLayoutComponent — menu no celular', () => {
  const montar = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    const fixture = TestBed.createComponent(AppLayoutComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  };
  const gaveta = (el: HTMLElement) =>
    el.querySelector('[role="dialog"][aria-label="Menu principal"]');
  const abrir = (el: HTMLElement) =>
    (el.querySelector('button[aria-label="Abrir menu"]') as HTMLButtonElement).click();

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('começa fechada e abre pelo botão do topo, com o mesmo menu da barra lateral', () => {
    const { fixture, el } = montar();
    expect(gaveta(el)).toBeNull();
    abrir(el);
    fixture.detectChanges();
    const dlg = gaveta(el);
    expect(dlg).not.toBeNull();
    const nomes = Array.from(dlg!.querySelectorAll('nav a')).map((a) => a.textContent);
    expect(nomes.length).toBe(10);
    expect(nomes.join(' ')).toContain('Movimentações');
    expect(nomes.join(' ')).toContain('Cardápio');
  });

  it('trava a rolagem da página enquanto aberta e solta ao fechar', () => {
    const { fixture, el } = montar();
    abrir(el);
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(gaveta(el)).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('fecha ao tocar num item do menu', () => {
    const { fixture, el } = montar();
    abrir(el);
    fixture.detectChanges();
    (gaveta(el)!.querySelector('nav a') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(gaveta(el)).toBeNull();
  });

  it('fecha ao tocar no fundo escurecido', () => {
    const { fixture, el } = montar();
    abrir(el);
    fixture.detectChanges();
    const fundo = el.querySelector(
      'div.fixed.inset-0 > button[aria-label="Fechar menu"]',
    ) as HTMLButtonElement;
    fundo.click();
    fixture.detectChanges();
    expect(gaveta(el)).toBeNull();
  });
});

describe('AppLayoutComponent — menu do usuário: Minha conta', () => {
  const montar = () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        // O modal busca a conta ao abrir; aqui só interessa que ele abre.
        {
          provide: ContaService,
          useValue: {
            dados: signal(null),
            restaurante: signal(''),
            membros: signal([]),
            exclusaoPedidaEm: signal(null),
            carregarConta: () => new Promise<void>(() => undefined),
            carregarRestaurante: () => Promise.resolve(),
            carregarMembros: () => Promise.resolve(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AppLayoutComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('o menu do usuário tem "Minha conta", e o modal só existe depois de pedir', () => {
    const { fixture, el } = montar();
    const botaoUsuario = el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    botaoUsuario.click();
    fixture.detectChanges();

    const item = el.querySelector('[data-testid="menu-minha-conta"]') as HTMLButtonElement;
    expect(item).not.toBeNull();
    expect(item.textContent).toContain('Minha conta');
    expect(el.querySelector('app-minha-conta')).toBeNull();

    item.click();
    fixture.detectChanges();
    expect(el.querySelector('app-minha-conta')).not.toBeNull();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Minha conta');
    // O menu fecha ao abrir o modal.
    expect(el.querySelector('[data-testid="menu-minha-conta"]')).toBeNull();
  });
});
