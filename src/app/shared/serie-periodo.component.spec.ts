import { TestBed } from '@angular/core/testing';
import { SerieService } from '../services/serie.service';
import { SeriePeriodoComponent } from './serie-periodo.component';

// P.3: seletor Dia / Semana / Mês / Ano nos gráficos alimentados pela API.

const ponto = (key: string, v: number) => ({
  key,
  end: key,
  revenue: v,
  cmv: v / 4,
  expenses: v / 4,
  taxes: 0,
  profit: v / 2,
  cashIn: v,
  cashOut: v / 2,
});

function montar(metrica: 'resultado' | 'custos' | 'caixa') {
  const buscar = vi.fn((modo: string) =>
    Promise.resolve(
      modo === 'ano'
        ? {
            granularity: 'month',
            points: [ponto('2026-10', 1000), ponto('2026-11', 800)],
            previousYear: [ponto('2025-10', 600), ponto('2025-11', 400)],
          }
        : {
            granularity: 'day',
            points: [ponto('2026-11-19', 100), ponto('2026-11-20', -50)],
            previousYear: null,
          },
    ),
  );
  TestBed.configureTestingModule({ providers: [{ provide: SerieService, useValue: { buscar } }] });
  const fixture = TestBed.createComponent(SeriePeriodoComponent);
  fixture.componentRef.setInput('metrica', metrica);
  fixture.detectChanges();
  const c = fixture.componentInstance as unknown as {
    trocar(m: string): Promise<void>;
    modo(): string;
    dados(): { rotulo: string; profit: number }[];
    dadosAno(): { rotulo: string; atual: number; anterior: number }[];
  };
  return { fixture, c, buscar };
}

describe('SeriePeriodoComponent (P.3)', () => {
  it('abre em Mês (o gráfico da própria tela) sem chamar a API', () => {
    const { c, buscar } = montar('resultado');
    expect(c.modo()).toBe('mes');
    expect(buscar).not.toHaveBeenCalled();
  });

  it('Dia: busca a série e rotula dd/mm', async () => {
    const { c, buscar } = montar('resultado');
    await c.trocar('dia');
    expect(buscar).toHaveBeenCalledWith('dia');
    expect(c.dados().map((d) => d.rotulo)).toEqual(['19/11', '20/11']);
  });

  it('Ano: mês a mês com o ano anterior; o número depende do gráfico', async () => {
    const custos = montar('custos');
    await custos.c.trocar('ano');
    expect(custos.c.dadosAno()).toEqual([
      { rotulo: 'Out/26', atual: 500, anterior: 300 },
      { rotulo: 'Nov/26', atual: 400, anterior: 200 },
    ]);
    TestBed.resetTestingModule();
    const caixa = montar('caixa');
    await caixa.c.trocar('ano');
    expect(caixa.c.dadosAno()[0]).toEqual({ rotulo: 'Out/26', atual: 500, anterior: 300 }); // entradas − saídas
  });

  it('erro da API mostra a mensagem, sem quebrar a tela', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SerieService,
          useValue: { buscar: vi.fn(() => Promise.reject(new Error('x'))) },
        },
      ],
    });
    const fixture = TestBed.createComponent(SeriePeriodoComponent);
    fixture.componentRef.setInput('metrica', 'resultado');
    const c = fixture.componentInstance as unknown as {
      trocar(m: string): Promise<void>;
      erro(): string | null;
    };
    await c.trocar('semana');
    expect(c.erro()).toContain('Não foi possível');
  });
});
