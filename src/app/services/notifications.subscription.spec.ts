import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { computeSubscriptionState } from 'mintly-lib';
import { AuthService } from './auth.service';
import { CardapioService } from './cardapio.service';
import { NotificationsService } from './notifications.service';

const DAY = 24 * 60 * 60 * 1000;

describe('NotificationsService — aviso de assinatura', () => {
  let endsAt: string | null;
  let alertas: ReturnType<typeof signal<unknown[]>>;
  const keepPrice = vi.fn();

  function create(): NotificationsService {
    alertas = signal<unknown[]>([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { subscriptionState: () => computeSubscriptionState(endsAt) },
        },
        { provide: CardapioService, useValue: { alertas, refreshAlertas: vi.fn(), keepPrice } },
      ],
    });
    return TestBed.inject(NotificationsService);
  }

  beforeEach(() => {
    sessionStorage.clear();
    endsAt = null;
  });

  it('sem assinatura ou com a data longe: nenhum aviso', () => {
    expect(create().notifications()).toEqual([]);
  });

  it('data longe: nenhum aviso', () => {
    endsAt = new Date(Date.now() + 30 * DAY).toISOString();
    expect(create().notifications()).toEqual([]);
  });

  it('a 3 dias do vencimento: avisa, com ação "Renovar" para a tela de assinatura', () => {
    endsAt = new Date(Date.now() + 3 * DAY - 1000).toISOString();
    const [n] = create().notifications();
    expect(n).toMatchObject({
      kind: 'subscription',
      title: 'Sua assinatura vence em 3 dias',
      actionLabel: 'Renovar',
      actionRoute: '/assinatura',
      dismissLabel: 'Agora não',
    });
  });

  it('vencida: não há aviso (a pessoa já cai na tela de assinatura)', () => {
    endsAt = new Date(Date.now() - DAY).toISOString();
    expect(create().notifications()).toEqual([]);
  });

  it('"Agora não" some nesta sessão e volta no próximo acesso', () => {
    endsAt = new Date(Date.now() + 2 * DAY).toISOString();
    const svc = create();
    expect(svc.count()).toBe(1);

    svc.dismissSubscriptionNotice();
    expect(svc.count()).toBe(0);
    expect(sessionStorage.getItem('mintly-sub-notice-dismissed')).toBe(endsAt);

    // "próximo acesso" = sessão nova sem a marca
    sessionStorage.clear();
    TestBed.resetTestingModule();
    expect(create().count()).toBe(1);
  });

  it('depois de renovar (nova data) o aviso seguinte não herda a dispensa anterior', () => {
    endsAt = new Date(Date.now() + 2 * DAY).toISOString();
    sessionStorage.setItem(
      'mintly-sub-notice-dismissed',
      new Date(Date.now() - 100 * DAY).toISOString(),
    );
    expect(create().count()).toBe(1);
  });

  it('o aviso de assinatura vem antes dos avisos de preço e os dois convivem', () => {
    endsAt = new Date(Date.now() + 1 * DAY).toISOString();
    const svc = create();
    alertas.set([{ id: 'p1', name: 'Frango', price: 40, daysSinceReview: 190 }]);
    const list = svc.notifications();
    expect(list.map((n) => n.kind)).toEqual(['subscription', 'price']);
    expect(svc.count()).toBe(2);
  });
});
