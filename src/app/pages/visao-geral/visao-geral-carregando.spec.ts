import { signal } from '@angular/core';
import { FluxoCaixaService } from '../../services/fluxo-caixa.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { DashboardService } from '../../services/dashboard.service';
import { NotificationsService } from '../../services/notifications.service';
import { ToastService } from '../../shared/toast.service';
import { VisaoGeralComponent } from './visao-geral.component';

describe('Visão Geral: esqueleto na primeira carga (relatório U.1)', () => {
  function montar(loading: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // Card 'Estou devendo?' (P.8): sem resposta, fica no esqueleto e não atrapalha.
        {
          provide: FluxoCaixaService,
          useValue: { fetchReport: vi.fn(() => new Promise(() => undefined)) },
        },
        {
          provide: DashboardService,
          useValue: {
            data: signal(null),
            loading: signal(loading),
            refresh: vi.fn(() => new Promise<void>(() => undefined)),
          },
        },
        { provide: AiService, useValue: { textosInsights: vi.fn(() => Promise.resolve([])) } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: NotificationsService, useValue: { setRecomendacoes: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(VisaoGeralComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('carregando sem dado ainda: mostra o formato da tela', () => {
    const el = montar(true).querySelector('[data-testid="visao-geral-carregando"]');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('aria-busy')).toBe('true');
  });

  it('sem carregar e sem dado (deu erro): sem esqueleto preso na tela', () => {
    expect(montar(false).querySelector('[data-testid="visao-geral-carregando"]')).toBeNull();
  });
});
