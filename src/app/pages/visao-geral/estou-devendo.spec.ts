import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FluxoCaixaService } from '../../services/fluxo-caixa.service';
import { EstouDevendoComponent, resumoDivida } from './estou-devendo.component';

// P.8 do relatório Sweetie Bel: card "Estou devendo?".

const rel = (cashToday: number, payable: number, overduePayable = 0, count = 0) => ({
  cashToday,
  payable,
  overdue: { count, receivable: 0, payable: overduePayable },
});

describe('resumoDivida (P.8)', () => {
  it('vencido manda: a resposta é "sim" mesmo com caixa sobrando', () => {
    const r = resumoDivida(rel(5_000, 1_800, 300, 2));
    expect(r).toMatchObject({
      vencido: 300,
      vencidosQtd: 2,
      proximos: 1_500,
      livre: 3_200,
      situacao: 'vencido',
    });
  });

  it('nada vencido, mas o caixa não cobre os próximos 7 dias: apertado, com o que falta', () => {
    const r = resumoDivida(rel(1_000, 1_250));
    expect(r).toMatchObject({ vencido: 0, proximos: 1_250, livre: -250, situacao: 'apertado' });
  });

  it('caixa cobre tudo: tranquilo; contagem de vencidos zera sem vencido', () => {
    const r = resumoDivida(rel(2_000, 400, 0, 3));
    expect(r).toMatchObject({
      vencido: 0,
      vencidosQtd: 0,
      proximos: 400,
      livre: 1_600,
      situacao: 'tranquilo',
    });
  });

  it('arredonda centavos e nunca mostra próximo negativo', () => {
    expect(resumoDivida(rel(100.1, 0.2)).livre).toBe(99.9);
    expect(resumoDivida(rel(100, 50, 80, 1)).proximos).toBe(0);
  });
});

describe('EstouDevendoComponent (P.8)', () => {
  async function montar(fetch: () => Promise<unknown>) {
    const fluxo = { fetchReport: vi.fn(fetch) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: FluxoCaixaService, useValue: fluxo }],
    });
    const fixture = TestBed.createComponent(EstouDevendoComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) =>
      el.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    return { fluxo, q };
  }

  it('pede o Fluxo de caixa de 7 dias e mostra vencido, próximos e caixa livre', async () => {
    const { fluxo, q } = await montar(() => Promise.resolve(rel(5_000, 1_800, 300, 2)));
    expect(fluxo.fetchReport).toHaveBeenCalledWith(7);
    expect(q('estou-devendo-resposta')).toMatch(/Sim: R\$\s?300,00 em contas vencidas/);
    expect(q('estou-devendo-vencido')).toMatch(/R\$\s?300,00 2 contas/);
    expect(q('estou-devendo-proximos')).toMatch(/R\$\s?1\.500,00/);
    expect(q('estou-devendo-livre')).toMatch(/R\$\s?3\.200,00 De R\$\s?5\.000,00 em caixa hoje/);
  });

  it('apertado diz quanto falta; tranquilo diz quanto sobra', async () => {
    expect(
      (await montar(() => Promise.resolve(rel(1_000, 1_250)))).q('estou-devendo-resposta'),
    ).toMatch(/não cobre o que vence em 7 dias: faltam R\$\s?250,00/);
    TestBed.resetTestingModule();
    expect(
      (await montar(() => Promise.resolve(rel(2_000, 400)))).q('estou-devendo-resposta'),
    ).toMatch(/Não\. Depois de pagar o que vence em 7 dias, sobram R\$\s?1\.600,00/);
    TestBed.resetTestingModule();
    expect(
      (await montar(() => Promise.resolve(rel(2_000, 0)))).q('estou-devendo-resposta'),
    ).toContain('Não. Nada vencido e nada a pagar nos próximos 7 dias.');
  });

  it('sem conseguir consultar, avisa e aponta o Fluxo de caixa', async () => {
    const { q } = await montar(() => Promise.reject(new Error('offline')));
    expect(q('estou-devendo-erro')).toContain('Fluxo de caixa');
    expect(q('estou-devendo-resposta')).toBeNull();
  });
});
