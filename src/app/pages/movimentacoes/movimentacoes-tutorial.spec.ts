import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { TourService } from '../../tutorial/tour.service';
import { LANCAMENTO_STEPS, PAGE_STEPS } from '../../tutorial/tour-steps';
import { MovimentacoesComponent } from './movimentacoes.component';

// Pedido do Nathan (18/11): tutorial de como criar uma movimentação.

describe('Movimentações: "Como lançar?"', () => {
  function montar() {
    const vazio = { refresh: vi.fn().mockResolvedValue(undefined) };
    const tour = { startSteps: vi.fn(() => true), start: vi.fn(), stop: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TourService, useValue: tour },
        {
          provide: MovimentacoesService,
          useValue: {
            ...vazio,
            movements: signal([]),
            loading: signal(false),
            loaded: signal(true),
          },
        },
        { provide: ContasService, useValue: { ...vazio, accounts: signal([]) } },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        { provide: CategoriasService, useValue: { ...vazio, categories: signal([]) } },
      ],
    });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    return { fixture, tour, el: fixture.nativeElement as HTMLElement };
  }

  it('o botão abre uma nova entrada e começa o passo a passo do formulário', async () => {
    vi.useFakeTimers();
    const { fixture, tour, el } = montar();
    (el.querySelector('[data-testid="tutorial-lancamento"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((fixture.componentInstance as unknown as { creating(): boolean }).creating()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(tour.startSteps).toHaveBeenCalledWith(LANCAMENTO_STEPS);
    vi.useRealTimers();
  });

  it('todo passo do tutorial aponta para um campo que existe no formulário de nova entrada', () => {
    const { fixture, el } = montar();
    (fixture.componentInstance as unknown as { openCreate(t: string): void }).openCreate('income');
    fixture.detectChanges();
    for (const passo of LANCAMENTO_STEPS) {
      expect(document.querySelector(`[data-tour="${passo.target}"]`), passo.target).not.toBeNull();
    }
    expect(el.querySelector('[data-tour="como-lancar"]')).not.toBeNull();
  });

  it('o tutorial da página aponta para o "Como lançar?"', () => {
    expect(PAGE_STEPS['movimentacoes'].map((s) => s.target)).toContain('como-lancar');
  });
});
