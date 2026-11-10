import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { CardapioService, Prato } from '../../services/cardapio.service';
import { CardapioInterativoComponent } from './cardapio-interativo.component';

const prato = (over: Partial<Prato> = {}): Prato => ({
  id: 'p1',
  name: 'Frango Coreano',
  category: 'Pratos',
  price: 30,
  cost: 14,
  soldPerMonth: 300,
  active: true,
  priceUpdatedAt: '2026-01-01T00:00:00.000Z',
  priceReviewedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const sugestao = (over: Record<string, unknown> = {}) => ({
  menuItemId: 'p1',
  name: 'Frango Coreano',
  currentPrice: 30,
  suggestedPrice: 33.5,
  increasePercent: 11.7,
  reason: 'Parado há muito tempo e com boa saída.',
  cached: false,
  limitPerDay: 20,
  usedToday: 1,
  remainingToday: 19,
  ...over,
});

/** O que o teste usa do componente (os membros são `protected` só para o TypeScript). */
interface Interno {
  sugerirComIa(): Promise<void>;
  sugestao(): { reason: string } | null;
  selecionado(): string | null;
  precos(): Record<string, number>;
  aplicada(): boolean;
  erroIa(): string | null;
  sugerindo(): boolean;
  faixa(): { max: number };
  semChamadas(): boolean;
  pct(n: number): string;
  iaDisponivel(): boolean;
  pratos(): { id: string }[];
}

const httpError = (status: number, message: string) => ({
  response: { status, data: { message } },
});

describe('CardapioInterativoComponent: sugestão de aumento pela IA', () => {
  function montar(pratos: Prato[] = [prato()], disponivel = true) {
    const ai = {
      disponivel,
      uso: signal<{ limitPerDay: number; usedToday: number; remainingToday: number } | null>(null),
      carregarUso: vi.fn(() => Promise.resolve()),
      sugerirPreco: vi.fn(() => Promise.resolve(sugestao())),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AiService, useValue: ai },
        { provide: CardapioService, useValue: { pratos: signal(pratos), loading: signal(false) } },
      ],
    });
    // Sem renderizar o gráfico: o que importa aqui é o estado, e protected é só do TypeScript.
    const c = TestBed.createComponent(CardapioInterativoComponent)
      .componentInstance as unknown as Interno;
    return { c, ai };
  }

  it('ao abrir a tela carrega quantas sugestões restam hoje', () => {
    const { ai } = montar();
    expect(ai.carregarUso).toHaveBeenCalledTimes(1);
  });

  it('a IA escolhe o prato (a chamada não leva id): seleciona, coloca o preço sugerido no simulador e guarda a justificativa', async () => {
    const { c, ai } = montar();

    await c.sugerirComIa();

    expect(ai.sugerirPreco).toHaveBeenCalledWith();
    expect(c.sugestao()?.reason).toBe('Parado há muito tempo e com boa saída.');
    expect(c.selecionado()).toBe('p1');
    expect(c.precos()['p1']).toBe(33.5);
    expect(c.aplicada()).toBe(true);
    expect(c.erroIa()).toBeNull();
    expect(c.sugerindo()).toBe(false);
  });

  it('a faixa do controle cresce até o preço sugerido (a sugestão pode passar do alcance normal de R$ 10)', async () => {
    const { c, ai } = montar();
    ai.sugerirPreco.mockResolvedValue(sugestao({ suggestedPrice: 36, increasePercent: 20 }));
    await c.sugerirComIa();
    // faixa normal: preço + R$ 10 = 40; para um prato de R$ 30 o 36 cabe sem esticar
    expect(c.faixa().max).toBe(40);
  });

  it('prato caro: a faixa passa do alcance normal (preço + R$ 10) até o preço sugerido', async () => {
    const { c, ai } = montar([prato({ price: 80, cost: 30 })]);
    ai.sugerirPreco.mockResolvedValue(
      sugestao({ currentPrice: 80, suggestedPrice: 96, increasePercent: 20 }),
    );

    await c.sugerirComIa();

    expect(c.faixa().max).toBe(96); // o normal pararia em 90
    expect(c.faixa().max).toBeGreaterThanOrEqual(c.precos()['p1']);
  });

  it('sugestão de manter o preço (0%): mostra a caixa, mas não mexe no simulador', async () => {
    const { c, ai } = montar();
    ai.sugerirPreco.mockResolvedValue(sugestao({ suggestedPrice: 30, increasePercent: 0 }));

    await c.sugerirComIa();

    expect(c.sugestao()).not.toBeNull();
    expect(c.precos()['p1']).toBeUndefined();
    expect(c.aplicada()).toBe(false);
  });

  it('prato sem custo ou sem vendas não está na análise: mostra a sugestão, mas não simula', async () => {
    const { c } = montar([prato({ cost: 0 })]);

    await c.sugerirComIa();

    expect(c.sugestao()).not.toBeNull();
    expect(c.selecionado()).toBeNull();
    expect(c.aplicada()).toBe(false);
  });

  it('erro da API (ex.: acabou o limite do dia) mostra a mensagem dela e mantém a sugestão anterior', async () => {
    const { c, ai } = montar();
    await c.sugerirComIa();
    ai.sugerirPreco.mockRejectedValue(
      httpError(429, 'Você já usou as 20 sugestões da IA de hoje.'),
    );

    await c.sugerirComIa();

    expect(c.erroIa()).toBe('Você já usou as 20 sugestões da IA de hoje.');
    expect(c.sugestao()).not.toBeNull();
    expect(c.sugerindo()).toBe(false);
  });

  it('erro sem mensagem da API: texto padrão e o botão volta a funcionar', async () => {
    const { c, ai } = montar();
    ai.sugerirPreco.mockRejectedValue(new Error('x'));

    await c.sugerirComIa();

    expect(c.erroIa()).toContain('Não foi possível pedir a sugestão');
    expect(c.sugerindo()).toBe(false);
  });

  it('um novo pedido limpa o erro anterior', async () => {
    const { c, ai } = montar();
    ai.sugerirPreco.mockRejectedValueOnce(httpError(503, 'A IA não está disponível agora.'));
    await c.sugerirComIa();
    expect(c.erroIa()).not.toBeNull();

    await c.sugerirComIa();
    expect(c.erroIa()).toBeNull();
  });

  it('cliques repetidos enquanto pensa viram um pedido só (não gasta o limite do dia à toa)', async () => {
    const { c, ai } = montar();
    let liberar!: () => void;
    ai.sugerirPreco.mockReturnValue(
      new Promise((resolve) => {
        liberar = () => resolve(sugestao());
      }),
    );

    const a = c.sugerirComIa();
    const b = c.sugerirComIa();
    expect(c.sugerindo()).toBe(true);
    liberar();
    await Promise.all([a, b]);

    expect(ai.sugerirPreco).toHaveBeenCalledTimes(1);
  });

  it('sem chamadas restantes hoje o botão fica desabilitado', () => {
    const { c, ai } = montar();
    expect(c.semChamadas()).toBe(false);
    ai.uso.set({ limitPerDay: 20, usedToday: 20, remainingToday: 0 });
    expect(c.semChamadas()).toBe(true);
    ai.uso.set({ limitPerDay: 20, usedToday: 19, remainingToday: 1 });
    expect(c.semChamadas()).toBe(false);
  });

  it('prato inativo não entra na tela (só os ativos, em ordem alfabética)', () => {
    const { c } = montar([
      prato({ id: 'z', name: 'Zebra' }),
      prato({ id: 'i', name: 'Inativo', active: false }),
      prato({ id: 'a', name: 'Abacate' }),
    ]);
    expect(c.pratos().map((p) => p.id)).toEqual(['a', 'z']);
  });

  it('no Básico o botão dá lugar ao convite para o Pro (a IA é do plano Pro)', () => {
    expect(montar().c.iaDisponivel()).toBe(true);
    TestBed.resetTestingModule();
    expect(montar([prato()], false).c.iaDisponivel()).toBe(false);
  });

  it('formata o aumento com vírgula', () => {
    const { c } = montar();
    expect(c.pct(11.7)).toBe('11,7%');
    expect(c.pct(20)).toBe('20,0%');
  });
});
