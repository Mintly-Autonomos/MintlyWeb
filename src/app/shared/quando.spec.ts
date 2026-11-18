import { quandoTexto } from './quando';

describe('quandoTexto (alerta de caixa sem "dia 0")', () => {
  it('hoje, amanhã ou a data com quantos dias faltam', () => {
    expect(quandoTexto('2026-11-18', '2026-11-18')).toBe('hoje');
    expect(quandoTexto('2026-11-19', '2026-11-18')).toBe('amanhã');
    expect(quandoTexto('2026-11-22', '2026-11-18')).toBe('em 22/11 (daqui a 4 dias)');
    expect(quandoTexto('2026-12-03', '2026-11-28')).toBe('em 03/12 (daqui a 5 dias)');
  });

  it('data que já passou conta como hoje (o caixa já está apertado)', () => {
    expect(quandoTexto('2026-11-10', '2026-11-18')).toBe('hoje');
  });
});
