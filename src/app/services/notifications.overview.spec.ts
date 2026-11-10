import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { computeSubscriptionState } from 'mintly-lib';
import { AuthService } from './auth.service';
import { CardapioService } from './cardapio.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService: lembrete de "O que fazer primeiro"', () => {
  function create(): NotificationsService {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { subscriptionState: () => computeSubscriptionState(null) },
        },
        {
          provide: CardapioService,
          useValue: { alertas: signal([]), refreshAlertas: vi.fn(), keepPrice: vi.fn() },
        },
      ],
    });
    return TestBed.inject(NotificationsService);
  }

  it('sem recomendações pendentes não há aviso', () => {
    const svc = create();
    expect(svc.notifications()).toEqual([]);
    svc.setRecomendacoes(0);
    expect(svc.count()).toBe(0);
  });

  it('com recomendações pendentes o sino avisa e leva à Visão Geral', () => {
    const svc = create();
    svc.setRecomendacoes(2);
    expect(svc.count()).toBe(1);
    expect(svc.notifications()[0]).toMatchObject({
      kind: 'overview',
      title: '2 recomendações pendentes em "O que fazer primeiro"',
      actionLabel: 'Ver agora',
      actionRoute: '/visao-geral',
      dismissLabel: 'Agora não',
    });
  });

  it('no singular fala "1 recomendação pendente"', () => {
    const svc = create();
    svc.setRecomendacoes(1);
    expect(svc.notifications()[0].title).toBe('1 recomendação pendente em "O que fazer primeiro"');
  });

  it('o aviso acompanha o número mais recente e some quando não há mais nada pendente', () => {
    const svc = create();
    svc.setRecomendacoes(3);
    svc.setRecomendacoes(0);
    expect(svc.notifications()).toEqual([]);
  });

  it('"Agora não" some neste acesso', () => {
    const svc = create();
    svc.setRecomendacoes(2);
    svc.dismissOverviewNotice();
    expect(svc.notifications()).toEqual([]);
  });
});
