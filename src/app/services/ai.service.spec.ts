import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AiService, textoDaIa } from './ai.service';
import { AuthService } from './auth.service';
import { CardapioService } from './cardapio.service';
import { MintlyClientService } from './mintly-client.service';

const flags = environment as { useMocks: boolean };
const ok = (payload: unknown) => Promise.resolve({ payload });
const httpError = (status: number, message = 'erro') => ({
  response: { status, data: { message } },
});

const uso = { limitPerDay: 20, usedToday: 3, remainingToday: 17 };
const textos = [
  {
    index: 0,
    kind: 'cashTight',
    title: 'Caixa curto no fim do mês',
    description: 'Antecipe um recebimento.',
  },
  {
    index: 1,
    kind: 'expenseAnomaly',
    title: 'Gasto fora do normal',
    description: 'Olhe a conta de luz.',
  },
];
const sugestao = {
  menuItemId: 'p1',
  name: 'Frango Coreano',
  currentPrice: 30,
  suggestedPrice: 33.5,
  increasePercent: 11.7,
  reason: 'Parado há muito tempo e com boa saída.',
  cached: false,
  ...uso,
};

describe('AiService', () => {
  let svc: AiService;
  let aiClient: Record<string, ReturnType<typeof vi.fn>>;
  let auth: {
    getAccessToken: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    subscriptionState: ReturnType<typeof vi.fn>;
  };
  const pratos = signal<unknown[]>([]);

  beforeEach(() => {
    flags.useMocks = false;
    aiClient = { usage: vi.fn(), insights: vi.fn(), priceSuggestion: vi.fn() };
    auth = {
      getAccessToken: vi.fn(() => 'token'),
      refresh: vi.fn(() => Promise.resolve(true)),
      subscriptionState: vi.fn(() => ({ status: 'active', tier: 'pro' })),
    };
    pratos.set([]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: CardapioService, useValue: { pratos } },
        { provide: MintlyClientService, useValue: { client: { aiClient } } },
      ],
    });
    svc = TestBed.inject(AiService);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    flags.useMocks = false;
    vi.restoreAllMocks();
  });

  describe('textosInsights', () => {
    it('pede só a tela e o mês (a API monta os dados) e devolve os textos, guardando o uso do dia', async () => {
      aiClient['insights'].mockReturnValue(
        ok({ page: 'overview', insights: textos, cached: false, ...uso }),
      );

      const res = await svc.textosInsights('overview', '2026-10');

      expect(res).toEqual(textos);
      expect(aiClient['insights']).toHaveBeenCalledWith(
        { page: 'overview', month: '2026-10' },
        { env: environment.mintlyEnv, authorization: 'Bearer token' },
      );
      expect(svc.uso()).toEqual(uso);
    });

    it('sem mês (mês atual) não manda o campo', async () => {
      aiClient['insights'].mockReturnValue(
        ok({ page: 'overview', insights: [], cached: false, ...uso }),
      );
      await svc.textosInsights('overview');
      expect(aiClient['insights'].mock.calls[0][0]).toEqual({ page: 'overview' });
    });

    it.each([[503], [429], [500], [400]])(
      'erro %s: devolve lista vazia (a tela fica com o texto de sempre) e não lança',
      async (status) => {
        aiClient['insights'].mockRejectedValue(httpError(status));
        await expect(svc.textosInsights('overview')).resolves.toEqual([]);
      },
    );

    it('rede caiu (sem resposta): lista vazia', async () => {
      aiClient['insights'].mockRejectedValue(new Error('Network Error'));
      await expect(svc.textosInsights('overview')).resolves.toEqual([]);
    });

    it('depois de 503 ou 429 não insiste (não gasta chamada nem tempo) até recarregar a página', async () => {
      aiClient['insights'].mockRejectedValue(httpError(429));
      await svc.textosInsights('overview');
      await svc.textosInsights('overview');
      await svc.textosInsights('overview', '2026-09');
      expect(aiClient['insights']).toHaveBeenCalledTimes(1);
    });

    it('um erro qualquer (500) não bloqueia as próximas tentativas', async () => {
      aiClient['insights']
        .mockRejectedValueOnce(httpError(500))
        .mockReturnValueOnce(ok({ page: 'overview', insights: textos, cached: true, ...uso }));
      expect(await svc.textosInsights('overview')).toEqual([]);
      expect(await svc.textosInsights('overview')).toEqual(textos);
    });

    it('401: renova o token uma vez e repete', async () => {
      aiClient['insights']
        .mockRejectedValueOnce(httpError(401))
        .mockReturnValueOnce(ok({ page: 'overview', insights: textos, cached: false, ...uso }));
      expect(await svc.textosInsights('overview')).toEqual(textos);
      expect(auth.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('sugerirPreco', () => {
    it('sem prato escolhido pede {} (a API escolhe o mais parado) e devolve a sugestão', async () => {
      aiClient['priceSuggestion'].mockReturnValue(ok(sugestao));
      expect(await svc.sugerirPreco()).toEqual(sugestao);
      expect(aiClient['priceSuggestion'].mock.calls[0][0]).toEqual({});
      expect(svc.uso()).toEqual(uso);
    });

    it('com prato escolhido manda só o id', async () => {
      aiClient['priceSuggestion'].mockReturnValue(ok(sugestao));
      await svc.sugerirPreco('p1');
      expect(aiClient['priceSuggestion'].mock.calls[0][0]).toEqual({ menuItemId: 'p1' });
    });

    it.each([[429], [503], [404], [400]])(
      'erro %s sobe para a tela mostrar o motivo',
      async (status) => {
        aiClient['priceSuggestion'].mockRejectedValue(httpError(status, 'mensagem da API'));
        await expect(svc.sugerirPreco()).rejects.toBeDefined();
      },
    );

    it('401: renova o token e repete', async () => {
      aiClient['priceSuggestion']
        .mockRejectedValueOnce(httpError(401))
        .mockReturnValueOnce(ok(sugestao));
      expect(await svc.sugerirPreco()).toEqual(sugestao);
      expect(auth.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('carregarUso', () => {
    it('guarda quantas chamadas restam', async () => {
      aiClient['usage'].mockReturnValue(ok(uso));
      await svc.carregarUso();
      expect(svc.uso()).toEqual(uso);
    });

    it('falha é silenciosa (a tela só não mostra o contador)', async () => {
      aiClient['usage'].mockRejectedValue(httpError(500));
      await expect(svc.carregarUso()).resolves.toBeUndefined();
      expect(svc.uso()).toBeNull();
    });
  });

  describe('modo demonstração (useMocks)', () => {
    const hoje = Date.now();
    const prato = (id: string, price: number, diasParado: number, active = true) => ({
      id,
      name: `Prato ${id}`,
      category: null,
      price,
      cost: 5,
      soldPerMonth: 10,
      active,
      priceUpdatedAt: new Date(hoje - diasParado * 86_400_000).toISOString(),
      priceReviewedAt: new Date(hoje - diasParado * 86_400_000).toISOString(),
    });

    beforeEach(() => {
      flags.useMocks = true;
      vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('textos de demonstração para os insights que estão na tela, sem chamar a API', async () => {
      const promessa = svc.textosInsights('overview', undefined, [
        { kind: 'cashTight' },
        { kind: 'outroDesconhecido' },
        { kind: 'breakEvenReached' },
      ]);
      await vi.advanceTimersByTimeAsync(700);
      const res = await promessa;
      expect(res.map((t) => [t.index, t.kind])).toEqual([
        [0, 'cashTight'],
        [2, 'breakEvenReached'],
      ]);
      expect(aiClient['insights']).not.toHaveBeenCalled();
    });

    it('sugere +10% (em múltiplos de R$ 0,50) para o prato ativo mais parado e conta a chamada', async () => {
      pratos.set([prato('a', 20, 30), prato('b', 30, 300), prato('c', 40, 500, false)]);
      const promessa = svc.sugerirPreco();
      await vi.advanceTimersByTimeAsync(1000);
      const s = await promessa;
      expect(s).toMatchObject({
        menuItemId: 'b',
        currentPrice: 30,
        suggestedPrice: 33,
        increasePercent: 10,
      });
      expect(svc.uso()).toEqual({ limitPerDay: 20, usedToday: 1, remainingToday: 19 });
      expect(aiClient['priceSuggestion']).not.toHaveBeenCalled();
    });

    it('sem pratos ativos explica o que fazer', async () => {
      const promessa = svc.sugerirPreco().catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(1000);
      expect(((await promessa) as Error).message).toContain('Cadastre pelo menos um prato');
    });
  });
});

describe('AiService: a IA é do plano Pro', () => {
  let svc: AiService;
  let aiClient: Record<string, ReturnType<typeof vi.fn>>;
  const estado = signal<{ status: string; tier: string | null }>({
    status: 'active',
    tier: 'basic',
  });

  beforeEach(() => {
    flags.useMocks = false;
    aiClient = { usage: vi.fn(), insights: vi.fn(), priceSuggestion: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            getAccessToken: () => 'token',
            refresh: vi.fn(),
            subscriptionState: () => estado(),
          },
        },
        { provide: CardapioService, useValue: { pratos: signal([]) } },
        { provide: MintlyClientService, useValue: { client: { aiClient } } },
      ],
    });
    svc = TestBed.inject(AiService);
  });

  it('só está disponível com assinatura ativa do Pro', () => {
    estado.set({ status: 'active', tier: 'basic' });
    expect(svc.disponivel).toBe(false);
    estado.set({ status: 'expired', tier: 'pro' });
    expect(svc.disponivel).toBe(false);
    estado.set({ status: 'none', tier: null });
    expect(svc.disponivel).toBe(false);
    estado.set({ status: 'active', tier: 'pro' });
    expect(svc.disponivel).toBe(true);
  });

  it('no Básico não chama a API: textos dos cards vêm vazios e o uso não é pedido', async () => {
    estado.set({ status: 'active', tier: 'basic' });
    expect(await svc.textosInsights('overview', '2026-10')).toEqual([]);
    await svc.carregarUso();
    expect(aiClient['insights']).not.toHaveBeenCalled();
    expect(aiClient['usage']).not.toHaveBeenCalled();
    expect(svc.uso()).toBeNull();
  });

  it('no Básico a sugestão de preço recusa sem chamar a API', async () => {
    estado.set({ status: 'active', tier: 'basic' });
    await expect(svc.sugerirPreco()).rejects.toThrow('plano Pro');
    expect(aiClient['priceSuggestion']).not.toHaveBeenCalled();
  });

  it('um 403 da API (plano mudou com o app aberto) para de pedir textos dos cards', async () => {
    estado.set({ status: 'active', tier: 'pro' });
    aiClient['insights'].mockRejectedValue({ response: { status: 403, data: { message: 'Pro' } } });
    expect(await svc.textosInsights('overview')).toEqual([]);
    expect(await svc.textosInsights('overview')).toEqual([]);
    expect(aiClient['insights']).toHaveBeenCalledTimes(1);
  });
});

describe('textoDaIa', () => {
  it('acha o texto pela posição e pelo tipo; se o tipo não bate, fica com o texto de sempre', () => {
    expect(textoDaIa(textos, 1, 'expenseAnomaly')?.title).toBe('Gasto fora do normal');
    expect(textoDaIa(textos, 1, 'cashTight')).toBeUndefined(); // a lista mudou no meio
    expect(textoDaIa(textos, 5, 'cashTight')).toBeUndefined();
    expect(textoDaIa([], 0, 'cashTight')).toBeUndefined();
  });
});
