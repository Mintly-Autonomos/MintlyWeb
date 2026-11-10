import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { DashboardService } from '../../services/dashboard.service';
import { NotificationsService } from '../../services/notifications.service';
import { ToastService } from '../../shared/toast.service';
import { VisaoGeralComponent } from './visao-geral.component';

const insights = [
  { kind: 'cashTight', severity: 'warning', date: '2026-07-22', balance: 900 },
  {
    kind: 'expenseAnomaly',
    severity: 'warning',
    name: 'Energia',
    categoryName: 'Utilidades',
    excess: 300,
    pctAbove: 0.25,
  },
];

const textosIa = [
  {
    index: 0,
    kind: 'cashTight',
    title: 'Caixa curto no fim do mês',
    description: 'Antecipe um recebimento.',
  },
];

/** O que o teste usa do componente. */
interface Interno {
  setMonth(m: 'mesPassado'): void;
  textosIa(): unknown;
  insightTitle(i: unknown, index?: number): string;
  insightDescription(i: unknown, index?: number): string;
  insightIa(i: unknown, index: number): boolean;
}

describe('VisaoGeralComponent: textos da IA nos cards', () => {
  function montar() {
    const dados = signal<unknown>({ insights });
    const dash = {
      data: dados,
      loading: signal(false),
      refresh: vi.fn(() => Promise.resolve()),
    };
    const ai = { textosInsights: vi.fn(() => Promise.resolve(textosIa)) };
    const toast = { error: vi.fn(), success: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DashboardService, useValue: dash },
        { provide: AiService, useValue: ai },
        { provide: ToastService, useValue: toast },
        { provide: NotificationsService, useValue: { setRecomendacoes: vi.fn() } },
      ],
    });
    // Template vazio: aqui só importa o texto dos cards (a lógica da classe é a mesma), sem os gráficos.
    TestBed.overrideComponent(VisaoGeralComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(VisaoGeralComponent);
    return { fixture, c: fixture.componentInstance as unknown as Interno, dash, ai, toast };
  }

  const aguardar = () => new Promise((r) => setTimeout(r, 0));
  /** Abre a tela (o primeiro detectChanges roda o ngOnInit uma vez) e espera a IA responder. */
  async function abrir(m: ReturnType<typeof montar>) {
    m.fixture.detectChanges();
    await aguardar();
  }

  it('ao carregar a tela pede os textos à IA (tela, mês e os insights de agora) e guarda a resposta', async () => {
    const m = montar();
    await abrir(m);

    expect(m.ai.textosInsights).toHaveBeenCalledTimes(1);
    const [page, month, atuais] = m.ai.textosInsights.mock.calls[0] as unknown as [
      string,
      string | undefined,
      unknown,
    ];
    expect(page).toBe('overview');
    expect(month === undefined || /^\d{4}-\d{2}$/.test(month)).toBe(true);
    expect(atuais).toEqual(insights);
    expect(m.c.textosIa()).toEqual(textosIa);
  });

  it('o card que tem texto da IA mostra o dela; os outros ficam com o texto de sempre', async () => {
    const m = montar();
    await abrir(m);

    expect(m.c.insightTitle(insights[0], 0)).toBe('Caixa curto no fim do mês');
    expect(m.c.insightDescription(insights[0], 0)).toBe('Antecipe um recebimento.');
    expect(m.c.insightIa(insights[0], 0)).toBe(true);

    expect(m.c.insightTitle(insights[1], 1)).toBe('Energia acima do normal'); // texto de sempre
    expect(m.c.insightIa(insights[1], 1)).toBe(false);
  });

  it('sem a posição (chamada antiga) ou com o tipo trocado, vale o texto de sempre', async () => {
    const m = montar();
    await abrir(m);

    expect(m.c.insightTitle(insights[0])).toBe('Caixa apertado a partir do dia 22');
    // a lista mudou no meio: a posição 0 agora é outro tipo de insight
    expect(m.c.insightTitle(insights[1], 0)).toBe('Energia acima do normal');
    expect(m.c.insightIa(insights[1], 0)).toBe(false);
  });

  it('IA sem resposta (lista vazia): tudo continua com o texto de sempre e nada é mostrado como erro', async () => {
    const m = montar();
    m.ai.textosInsights.mockResolvedValue([]);
    await abrir(m);

    expect(m.c.insightTitle(insights[0], 0)).toBe('Caixa apertado a partir do dia 22');
    expect(m.toast.error).not.toHaveBeenCalled();
  });

  it('sem insights na tela não chama a IA (não gasta o limite do dia)', async () => {
    const m = montar();
    m.dash.data.set({ insights: [] });
    await abrir(m);

    expect(m.ai.textosInsights).not.toHaveBeenCalled();
  });

  it('trocar de mês limpa os textos antigos e a resposta atrasada do mês anterior é ignorada', async () => {
    const m = montar();
    let responderPrimeira!: (v: unknown) => void;
    m.ai.textosInsights
      .mockReturnValueOnce(
        new Promise((resolve) => {
          responderPrimeira = resolve;
        }) as never,
      ) // 1ª: fica pendente
      .mockResolvedValueOnce([] as never); // 2ª: responde vazio na hora
    await abrir(m);

    m.c.setMonth('mesPassado');
    await aguardar();
    expect(m.ai.textosInsights).toHaveBeenCalledTimes(2);

    responderPrimeira(textosIa); // a resposta da 1ª chega depois da 2ª
    await aguardar();

    expect(m.c.textosIa()).toEqual([]); // vale a da 2ª
  });

  it('um mês diferente do padrão vai para a IA como AAAA-MM', async () => {
    const m = montar();
    await abrir(m);
    m.ai.textosInsights.mockClear();

    m.c.setMonth('mesPassado');
    await aguardar();

    const mes = (m.ai.textosInsights.mock.calls[0] as unknown as [string, string])[1];
    expect(mes).toMatch(/^\d{4}-\d{2}$/);
  });
});
