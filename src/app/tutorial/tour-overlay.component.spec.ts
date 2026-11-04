import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TourOverlayComponent } from './tour-overlay.component';
import { TourService } from './tour.service';

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
const rect = ({ top, bottom, left, right }: Rect) =>
  ({
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

describe('TourOverlayComponent', () => {
  let tour: TourService;
  let caixa: Rect;

  function alvo(nome: string): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-tour', nome);
    document.body.appendChild(el);
    return el;
  }

  async function montar() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    tour = TestBed.inject(TourService);
    const fixture = TestBed.createComponent(TourOverlayComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const settle = async () => {
      await new Promise((r) => setTimeout(r, 30));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, el, q, settle };
  }

  beforeEach(() => {
    caixa = { top: 300, bottom: 340, left: 100, right: 300 };
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      return [{}] as unknown as DOMRectList;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute('data-tour')
        ? rect(caixa)
        : rect({ top: 0, bottom: 0, left: 0, right: 0 });
    });
    window.scrollBy = vi.fn() as unknown as typeof window.scrollBy;
  });

  afterEach(() => {
    tour?.stop();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('sem tutorial não desenha nada', async () => {
    const { q } = await montar();
    expect(q('tour-cartao')).toBeNull();
    expect(q('tour-fundo')).toBeNull();
  });

  it('mostra o passo atual: contador, título, texto e botões', async () => {
    const { q, settle } = await montar();
    alvo('periodo');
    alvo('saude');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();

    const cartao = q('tour-cartao')!;
    expect(cartao.getAttribute('role')).toBe('dialog');
    expect(cartao.textContent).toContain('Passo 1 de 3');
    expect(cartao.textContent).toContain('Escolha o mês');
    expect(q('tour-proximo')!.textContent!.trim()).toBe('Próximo');
    expect(q('tour-voltar')).toBeNull(); // no primeiro passo não há "Voltar"
    expect(q('tour-pular')).not.toBeNull();
  });

  it('Próximo e Voltar andam pelos passos; no último o botão vira "Concluir" e fecha', async () => {
    const { q, settle } = await montar();
    alvo('periodo');
    alvo('saude');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();

    q('tour-proximo')!.click();
    await settle();
    expect(q('tour-cartao')!.textContent).toContain('Saúde financeira');
    expect(q('tour-voltar')).not.toBeNull();

    q('tour-voltar')!.click();
    await settle();
    expect(q('tour-cartao')!.textContent).toContain('Escolha o mês');

    q('tour-proximo')!.click();
    await settle();
    q('tour-proximo')!.click();
    await settle();
    expect(q('tour-proximo')!.textContent!.trim()).toBe('Concluir');
    q('tour-proximo')!.click();
    await settle();
    expect(q('tour-cartao')).toBeNull();
    expect(tour.active()).toBe(false);
  });

  it('"Pular tutorial" fecha na hora', async () => {
    const { q, settle } = await montar();
    alvo('periodo');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();
    q('tour-pular')!.click();
    await settle();
    expect(q('tour-cartao')).toBeNull();
  });

  it('teclado: setas navegam e Esc fecha', async () => {
    const { q, settle } = await montar();
    alvo('periodo');
    alvo('saude');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await settle();
    expect(q('tour-cartao')!.textContent).toContain('Saúde financeira');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await settle();
    expect(q('tour-cartao')!.textContent).toContain('Escolha o mês');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(q('tour-cartao')).toBeNull();
  });

  it('destaca o elemento com uma folga e põe o cartão abaixo, ligado por uma linha', async () => {
    const { q, settle } = await montar();
    alvo('periodo');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();

    const destaque = q('tour-destaque')!;
    expect(destaque.style.top).toBe('294px'); // 300 - folga de 6
    expect(destaque.style.left).toBe('94px');
    expect(destaque.style.width).toBe('212px');
    expect(destaque.style.height).toBe('52px');
    expect(q('tour-cartao')!.style.top).toBe('386px'); // fim do destaque (346) + 40 da linha
    expect(q('tour-linha')).not.toBeNull();
  });

  it('sem espaço embaixo, o cartão vai para cima do elemento', async () => {
    caixa = { top: 640, bottom: 700, left: 100, right: 300 };
    const { q, settle } = await montar();
    alvo('periodo');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();
    const topoCartao = parseFloat(q('tour-cartao')!.style.top);
    expect(topoCartao).toBeLessThan(parseFloat(q('tour-destaque')!.style.top));
    expect(q('tour-linha')).not.toBeNull();
  });

  it('elemento que ocupa a tela toda: o cartão fica sobre ele, sem linha', async () => {
    caixa = { top: 0, bottom: 768, left: 0, right: 1024 };
    const { q, settle } = await montar();
    alvo('periodo');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();
    expect(q('tour-destaque')).not.toBeNull();
    expect(q('tour-linha')).toBeNull();
  });

  it('rola a página até um elemento fora da tela', async () => {
    caixa = { top: 1500, bottom: 1560, left: 100, right: 300 };
    const { settle } = await montar();
    alvo('periodo');
    alvo('ajuda');
    tour.start('/visao-geral');
    await settle();
    expect(window.scrollBy).toHaveBeenCalled();
  });

  it('não rola para elementos do cabeçalho ou do menu (já são fixos)', async () => {
    caixa = { top: 14, bottom: 54, left: 100, right: 140 };
    const { settle } = await montar();
    const header = document.createElement('header');
    document.body.appendChild(header);
    const botao = document.createElement('button');
    botao.setAttribute('data-tour', 'ajuda');
    header.appendChild(botao);
    tour.start('/qualquer-coisa');
    await settle();
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
});
