import { signal } from '@angular/core';
import { FluxoCaixaService } from '../../services/fluxo-caixa.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { HealthCap } from 'mintly-lib';
import { AiService } from '../../services/ai.service';
import { DashboardService } from '../../services/dashboard.service';
import { NotificationsService } from '../../services/notifications.service';
import { ToastService } from '../../shared/toast.service';
import { VisaoGeralComponent } from './visao-geral.component';

interface Interno {
  travaSaude(): string | null;
  baseSaude(): string | null;
}

describe('Visão Geral: motivo da trava da nota e mês-base (relatório S2.3)', () => {
  function montar(
    health: { cap: HealthCap | null; basisMonth: string },
    referenceMonth = '2026-11',
  ) {
    const data = signal<unknown>({
      referenceMonth,
      insights: [],
      revenueVsExpense: [],
      profitWaterfall: { grossRevenue: 0, taxes: 0, cmv: 0, operatingExpenses: 0, netProfit: 0 },
      health: {
        score: 69,
        label: 'attention',
        pillars: [],
        bands: { risk: 40, attention: 70 },
        ...health,
      },
    });
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
          useValue: { data, loading: signal(false), refresh: vi.fn(() => Promise.resolve()) },
        },
        { provide: AiService, useValue: { textosInsights: vi.fn(() => Promise.resolve([])) } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        {
          provide: NotificationsService,
          useValue: { setRecomendacoes: vi.fn(), avisoTetoMei: () => null },
        },
      ],
    });
    TestBed.overrideComponent(VisaoGeralComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(VisaoGeralComponent);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Interno;
  }

  it('sem trava: nada a explicar', () => {
    expect(montar({ cap: null, basisMonth: '2026-10' }).travaSaude()).toBeNull();
  });

  it('um motivo: diz o teto e o porquê, com o nome do mês-base no prejuízo', () => {
    const c = montar({ cap: { maxScore: 69, reasons: ['loss'] }, basisMonth: '2026-10' });
    expect(c.travaSaude()).toBe('Nota limitada a 69: Outubro/2026 fechou no prejuízo.');
  });

  it('vários motivos: lista com "e" no fim', () => {
    const c = montar({
      cap: { maxScore: 39, reasons: ['negativeCash', 'loss', 'overduePayables'] },
      basisMonth: '2026-10',
    });
    expect(c.travaSaude()).toBe(
      'Nota limitada a 39: o caixa de hoje está negativo, Outubro/2026 fechou no prejuízo e há contas a pagar vencidas.',
    );
  });

  it('mês atual: a base é o último mês fechado e o caixa de hoje', () => {
    expect(montar({ cap: null, basisMonth: '2026-10' }).baseSaude()).toBe(
      'Base: Outubro/2026 (último mês fechado) e o caixa de hoje',
    );
  });

  it('mês passado: a base é o próprio mês', () => {
    expect(montar({ cap: null, basisMonth: '2026-09' }, '2026-09').baseSaude()).toBe(
      'Base: Setembro/2026',
    );
  });
});
