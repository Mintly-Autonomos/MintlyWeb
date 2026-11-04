import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { TourService, findTourTarget } from './tour.service';

/** O jsdom não tem layout: "visível" aqui é "não tem o atributo hidden". */
function simularLayout() {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.hidden ? [] : [{}]) as unknown as DOMRectList;
  });
}

function alvo(nome: string, oculto = false): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-tour', nome);
  el.hidden = oculto;
  document.body.appendChild(el);
  return el;
}

describe('TourService', () => {
  let tour: TourService;

  beforeEach(() => {
    simularLayout();
    tour = TestBed.inject(TourService);
  });

  afterEach(() => {
    tour.stop();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('findTourTarget ignora o elemento escondido e acha o visível de mesmo nome', () => {
    alvo('menu-lateral', true);
    const visivel = alvo('menu-lateral');
    expect(findTourTarget('menu-lateral')).toBe(visivel);
    expect(findTourTarget('nao-existe')).toBeNull();
  });

  it('começa no primeiro passo da página com os alvos que estão na tela', () => {
    alvo('periodo');
    alvo('saude');
    alvo('ajuda');
    expect(tour.start('/visao-geral')).toBe(true);
    expect(tour.active()).toBe(true);
    expect(tour.steps().map((s) => s.target)).toEqual(['periodo', 'saude', 'ajuda']);
    expect(tour.current()?.target).toBe('periodo');
    expect(tour.index()).toBe(0);
    expect(tour.total()).toBe(3);
    expect(tour.isFirst()).toBe(true);
    expect(tour.isLast()).toBe(false);
  });

  it('pula o passo cujo alvo não está na tela (escondido ou ausente)', () => {
    alvo('periodo');
    alvo('saude', true);
    alvo('menu-celular', true); // só aparece no celular
    alvo('ajuda');
    tour.start('/visao-geral');
    expect(tour.steps().map((s) => s.target)).toEqual(['periodo', 'ajuda']);
  });

  it('sem nenhum alvo visível não abre', () => {
    expect(tour.start('/visao-geral')).toBe(false);
    expect(tour.active()).toBe(false);
    expect(tour.current()).toBeNull();
  });

  it('próximo e voltar andam pelos passos; voltar não passa do primeiro', () => {
    alvo('periodo');
    alvo('saude');
    alvo('ajuda');
    tour.start('/visao-geral');
    tour.prev();
    expect(tour.index()).toBe(0);
    tour.next();
    expect(tour.current()?.target).toBe('saude');
    tour.next();
    expect(tour.isLast()).toBe(true);
    tour.prev();
    expect(tour.current()?.target).toBe('saude');
  });

  it('próximo no último passo conclui (fecha)', () => {
    alvo('ajuda');
    tour.start('/qualquer-coisa');
    expect(tour.isLast()).toBe(true);
    tour.next();
    expect(tour.active()).toBe(false);
    expect(tour.current()).toBeNull();
  });

  it('pular fecha e limpa; dá para começar de novo do primeiro passo', () => {
    alvo('periodo');
    alvo('ajuda');
    tour.start('/visao-geral');
    tour.next();
    tour.stop();
    expect(tour.active()).toBe(false);
    expect(tour.steps()).toEqual([]);
    tour.start('/visao-geral');
    expect(tour.index()).toBe(0);
  });

  it('trocar de tela com o tutorial aberto fecha o tutorial', () => {
    alvo('periodo');
    alvo('ajuda');
    tour.start('/visao-geral');
    (TestBed.inject(Router).events as Subject<unknown>).next(new NavigationStart(1, '/custos'));
    expect(tour.active()).toBe(false);
  });
});
