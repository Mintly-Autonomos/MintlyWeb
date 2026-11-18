import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { DashboardService } from '../../services/dashboard.service';
import { FluxoCaixaService } from '../../services/fluxo-caixa.service';
import { NotificationsService } from '../../services/notifications.service';
import { ToastService } from '../../shared/toast.service';
import { VisaoGeralComponent } from './visao-geral.component';

// Pilar "Dívidas e vencidos" na nota de saúde (decisão do Nathan: vencido ÷ despesa do mês, peso 15%).

interface Interno {
  temPilarDividas(): boolean;
  pillarLabel: Record<string, string>;
  pillarDetail(key: string, value: number | null, mesPassado?: boolean): string;
}

function montar(
  pillars: { key: string; weight: number; score: number | null; value: number | null }[],
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: FluxoCaixaService,
        useValue: { fetchReport: vi.fn(() => new Promise(() => undefined)) },
      },
      {
        provide: DashboardService,
        useValue: {
          data: signal({ insights: [], health: { score: 80, cap: null, pillars } }),
          loading: signal(false),
          refresh: vi.fn(() => Promise.resolve()),
        },
      },
      { provide: AiService, useValue: { textosInsights: vi.fn(() => Promise.resolve([])) } },
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      { provide: NotificationsService, useValue: { setRecomendacoes: vi.fn() } },
    ],
  });
  TestBed.overrideComponent(VisaoGeralComponent, { set: { template: '', imports: [] } });
  return TestBed.createComponent(VisaoGeralComponent).componentInstance as unknown as Interno;
}

describe('Visão geral: pilar Dívidas', () => {
  it('com o pilar vindo da API, a linha avulsa some; sem ele (API antiga), continua', () => {
    expect(montar([{ key: 'debts', weight: 0.15, score: 100, value: 0 }]).temPilarDividas()).toBe(
      true,
    );
    TestBed.resetTestingModule();
    expect(
      montar([{ key: 'netMargin', weight: 0.3, score: 90, value: 0.08 }]).temPilarDividas(),
    ).toBe(false);
  });

  it('rótulo e detalhe do pilar', () => {
    const c = montar([]);
    expect(c.pillarLabel['debts']).toBe('Dívidas e vencidos');
    expect(c.pillarDetail('debts', 0)).toBe('nada vencido');
    expect(c.pillarDetail('debts', 0.1)).toContain('da despesa do mês');
    expect(c.pillarDetail('debts', null, true)).toBe('só calculado para o mês atual');
  });
});
