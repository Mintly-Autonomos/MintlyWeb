import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { DashboardService } from '../../services/dashboard.service';
import { NotificationsService } from '../../services/notifications.service';
import { ToastService } from '../../shared/toast.service';
import { VisaoGeralComponent } from './visao-geral.component';

interface Interno {
  semMovimento(): boolean;
  lancar(tipo: 'entrada' | 'saida'): void;
}

const comMovimento = {
  insights: [],
  revenueVsExpense: [{ month: '2026-10', revenue: 1000, expense: 700, projected: false }],
  profitWaterfall: {
    grossRevenue: 1000,
    taxes: 60,
    cmv: 300,
    operatingExpenses: 400,
    netProfit: 240,
  },
};
const semDados = {
  insights: [],
  revenueVsExpense: [{ month: '2026-10', revenue: 0, expense: 0, projected: false }],
  profitWaterfall: { grossRevenue: 0, taxes: 0, cmv: 0, operatingExpenses: 0, netProfit: 0 },
};

describe('VisaoGeralComponent: orientação e estado vazio', () => {
  function montar(dados: unknown) {
    const data = signal<unknown>(dados);
    const notifications = { setRecomendacoes: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: DashboardService,
          useValue: { data, loading: signal(false), refresh: vi.fn(() => Promise.resolve()) },
        },
        { provide: AiService, useValue: { textosInsights: vi.fn(() => Promise.resolve([])) } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: NotificationsService, useValue: notifications },
      ],
    });
    TestBed.overrideComponent(VisaoGeralComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(VisaoGeralComponent);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    return { c: fixture.componentInstance as unknown as Interno, data, notifications, navigate };
  }
  const aguardar = () => new Promise((r) => setTimeout(r, 0));

  it('sem nenhum lançamento nos 6 meses nem na cascata, os gráficos mostram o estado vazio', () => {
    expect(montar(semDados).c.semMovimento()).toBe(true);
  });

  it('com qualquer movimento (série ou cascata) os gráficos aparecem normalmente', () => {
    expect(montar(comMovimento).c.semMovimento()).toBe(false);
    TestBed.resetTestingModule();
    expect(
      montar({
        ...semDados,
        revenueVsExpense: [{ month: '2026-10', revenue: 10, expense: 0, projected: false }],
      }).c.semMovimento(),
    ).toBe(false);
  });

  it('enquanto não há dados carregados não mostra o estado vazio', () => {
    expect(montar(null).c.semMovimento()).toBe(false);
  });

  it('"Lançar venda" e "Lançar despesa" abrem Movimentações já com o formulário (?nova=)', () => {
    const { c, navigate } = montar(semDados);
    c.lancar('entrada');
    expect(navigate).toHaveBeenLastCalledWith(['/movimentacoes'], {
      queryParams: { nova: 'entrada' },
    });
    c.lancar('saida');
    expect(navigate).toHaveBeenLastCalledWith(['/movimentacoes'], {
      queryParams: { nova: 'saida' },
    });
  });

  it('avisa o sino de quantas recomendações pedem ação (conquista não conta)', async () => {
    const { notifications } = montar({
      ...comMovimento,
      insights: [
        { kind: 'cashTight', severity: 'warning', date: '2026-07-22', balance: 900 },
        { kind: 'breakEvenReached', severity: 'positive', day: 12 },
        { kind: 'taxRegimeNotConfigured', severity: 'info' },
      ],
    });
    await aguardar();
    expect(notifications.setRecomendacoes).toHaveBeenCalledWith(2);
  });

  it('sem nada pendente, o sino é avisado com zero (o lembrete some)', async () => {
    const { notifications } = montar(comMovimento);
    await aguardar();
    expect(notifications.setRecomendacoes).toHaveBeenCalledWith(0);
  });
});
