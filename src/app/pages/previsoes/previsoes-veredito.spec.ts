import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { PrevBase } from '../../services/previsoes.builder';
import { PrevisoesService } from '../../services/previsoes.service';
import { ToastService } from '../../shared/toast.service';
import { PrevisoesComponent } from './previsoes.component';

interface Interno {
  horizonte: { set(h: 30 | 60 | 90): void };
  statusMeta(): { titulo: string };
  lucroMes(): number;
  sim(): { resultado: { lucro: number } };
  dadosIncompletos(): boolean;
}

const HOJE = '2026-11-04';
const baseCom = (over: Partial<PrevBase>): PrevBase => ({
  hoje: HOJE,
  caixaHoje: 50_000,
  aliquota: 0,
  receitaDia: 1_000,
  custoVarDia: 300,
  custoFixoDia: 200,
  pendentes: [],
  realizado: {},
  temDados: true,
  ...over,
});

describe('Previsões: número grande, veredito e dados incompletos (relatório, 4.6 e 8.2)', () => {
  function montar(base: PrevBase) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: PrevisoesService,
          useValue: {
            base: signal(base),
            equipe: signal(null),
            loading: signal(false),
            loaded: signal(true),
            refresh: vi.fn(() => Promise.resolve()),
          },
        },
        {
          provide: CardapioService,
          useValue: { pratos: signal([]), refresh: vi.fn(() => Promise.resolve()) },
        },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    TestBed.overrideComponent(PrevisoesComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(PrevisoesComponent);
    return fixture.componentInstance as unknown as Interno;
  }

  it('o número grande acompanha o horizonte (antes ficava em 30 dias)', () => {
    const c = montar(baseCom({}));
    const em30 = c.lucroMes();
    c.horizonte.set(90);
    expect(c.lucroMes()).toBe(c.sim().resultado.lucro);
    expect(c.lucroMes()).toBeGreaterThan(em30);
  });

  it('o veredito fala do período escolhido, não do "mês", em 60 e 90 dias', () => {
    const c = montar(baseCom({}));
    expect(c.statusMeta().titulo).toBe('Mês saudável');
    c.horizonte.set(90);
    expect(c.statusMeta().titulo).toBe('Próximos 90 dias: saudáveis');
  });

  it('custo dos ingredientes acima das vendas no ritmo: avisa dados incompletos', () => {
    expect(montar(baseCom({ receitaDia: 380, custoVarDia: 540 })).dadosIncompletos()).toBe(true);
    TestBed.resetTestingModule();
    expect(montar(baseCom({})).dadosIncompletos()).toBe(false);
  });
});
