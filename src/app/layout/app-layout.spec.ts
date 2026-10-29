import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppLayoutComponent } from './app-layout.component';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
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
    expect(nomes.length).toBe(9);
    expect(nomes.join(' ')).toContain('Movimentações');
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
