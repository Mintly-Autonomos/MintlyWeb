import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { computeSubscriptionState } from 'mintly-lib';
import { AuthService } from './auth.service';
import { CardapioService } from './cardapio.service';
import { FluxoCaixaService } from './fluxo-caixa.service';
import { NotificationsService } from './notifications.service';
import { RestaurantProfile, RestauranteService, TaxInsight } from './restaurante.service';

describe('NotificationsService: contas vencidas e teto do MEI', () => {
  function create(opts: {
    overdue?: { count: number; receivable: number; payable: number };
    falhaFluxo?: boolean;
    insights?: TaxInsight[];
    semPerfil?: boolean;
  }) {
    const profile = signal<RestaurantProfile | null>(
      opts.semPerfil
        ? null
        : ({ tax: { insights: opts.insights ?? [] } } as unknown as RestaurantProfile),
    );
    const restaurante = { profile, refresh: vi.fn().mockResolvedValue(undefined) };
    const fluxo = {
      fetchReport: opts.falhaFluxo
        ? vi.fn().mockRejectedValue(new Error('offline'))
        : vi.fn().mockResolvedValue({
            overdue: opts.overdue ?? { count: 0, receivable: 0, payable: 0 },
          }),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { subscriptionState: () => computeSubscriptionState(null) },
        },
        {
          provide: CardapioService,
          useValue: {
            alertas: signal([]),
            refreshAlertas: vi.fn().mockResolvedValue(undefined),
            keepPrice: vi.fn(),
          },
        },
        { provide: RestauranteService, useValue: restaurante },
        { provide: FluxoCaixaService, useValue: fluxo },
      ],
    });
    return { svc: TestBed.inject(NotificationsService), restaurante, fluxo };
  }

  const mei = (usedPct: number): TaxInsight => ({
    kind: 'meiCapNear',
    severity: 'warning',
    usedPct,
    yearToDateRevenue: Math.round(81_000 * usedPct),
    annualLimit: 81_000,
  });

  it('conta a pagar vencida aparece no sino e leva ao Fluxo de caixa', async () => {
    const { svc } = create({ overdue: { count: 2, receivable: 0, payable: 1_250 } });
    await svc.refresh();
    expect(svc.notifications()[0]).toMatchObject({
      kind: 'overdue',
      title: expect.stringMatching(/R\$\s?1\.250,00 em contas a pagar vencidas/),
      actionRoute: '/fluxo-de-caixa',
      dismissLabel: 'Agora não',
    });
  });

  it('só valor a receber vencido não vira aviso', async () => {
    const { svc } = create({ overdue: { count: 1, receivable: 300, payable: 0 } });
    await svc.refresh();
    expect(svc.notifications()).toEqual([]);
  });

  it('sem conseguir consultar o fluxo, o sino segue sem o aviso (e sem erro)', async () => {
    const { svc } = create({ falhaFluxo: true });
    await expect(svc.refresh()).resolves.toBeUndefined();
    expect(svc.notifications()).toEqual([]);
  });

  it('teto do MEI perto: diz a porcentagem e o valor do ano', async () => {
    const { svc } = create({ insights: [mei(0.85)] });
    await svc.refresh();
    const n = svc.notifications()[0];
    expect(n).toMatchObject({
      kind: 'mei',
      title: 'O faturamento do ano já está em 85% do teto do MEI',
      actionRoute: '/resultado',
    });
    expect(n.description).toMatch(/R\$\s?68\.850,00 de R\$\s?81\.000,00 no ano/);
  });

  it('teto do MEI estourado muda o título', async () => {
    const { svc } = create({ insights: [mei(1.1)] });
    await svc.refresh();
    expect(svc.notifications()[0].title).toBe('O faturamento do ano passou do teto do MEI');
  });

  it('sem perfil carregado, o sino carrega o restaurante para saber do teto', async () => {
    const { svc, restaurante } = create({ semPerfil: true });
    await svc.refresh();
    expect(restaurante.refresh).toHaveBeenCalledOnce();
  });

  it('com perfil já carregado, não busca de novo', async () => {
    const { svc, restaurante } = create({ insights: [] });
    await svc.refresh();
    expect(restaurante.refresh).not.toHaveBeenCalled();
  });

  it('"Agora não" some neste acesso; os outros avisos ficam', async () => {
    const { svc } = create({
      overdue: { count: 1, receivable: 0, payable: 500 },
      insights: [mei(0.9)],
    });
    await svc.refresh();
    expect(svc.notifications().map((n) => n.kind)).toEqual(['overdue', 'mei']);
    svc.dismissNotice(svc.notifications()[0]);
    expect(svc.notifications().map((n) => n.kind)).toEqual(['mei']);
  });
});
