import { fmtShortDate, localISODate, localISOMonth, maskPhoneBR } from './format';

// O runner dos testes é Node; o tsconfig.spec não carrega @types/node.
declare const process: { env: Record<string, string | undefined> };

describe('fmtShortDate', () => {
  // Data de calendário não pode andar um dia para trás em fusos a oeste de UTC (Brasil, UTC-3).
  const originalTz = process.env['TZ'];
  beforeAll(() => {
    process.env['TZ'] = 'America/Sao_Paulo';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = originalTz;
  });

  it('mantém o dia de uma data só-dia', () => {
    expect(fmtShortDate('2026-10-28')).toBe('28/10/2026');
  });

  it('mantém o dia quando a API devolve meia-noite UTC', () => {
    expect(fmtShortDate('2026-10-28T00:00:00.000Z')).toBe('28/10/2026');
  });
});

describe('maskPhoneBR', () => {
  it('formata celular (11 dígitos) e fixo (10 dígitos)', () => {
    expect(maskPhoneBR('11999999999')).toBe('(11) 99999-9999');
    expect(maskPhoneBR('1133334444')).toBe('(11) 3333-4444');
  });

  it('corta dígitos além de 11 e ignora letras', () => {
    expect(maskPhoneBR('912345678912')).toBe('(91) 23456-7891');
    expect(maskPhoneBR('(11) 9a9')).toBe('(11) 99');
  });

  it('aceita digitação parcial e vazio', () => {
    expect(maskPhoneBR('')).toBe('');
    expect(maskPhoneBR('1')).toBe('(1');
    expect(maskPhoneBR('119')).toBe('(11) 9');
  });
});

describe('localISODate / localISOMonth', () => {
  it('usa o calendário de quem usa, não o UTC (23h30 do dia 29 continua dia 29)', () => {
    const noite = new Date(2026, 9, 29, 23, 30);
    expect(localISODate(noite)).toBe('2026-10-29');
    expect(localISOMonth(noite)).toBe('2026-10');
  });

  it('último minuto do mês continua no mês', () => {
    expect(localISOMonth(new Date(2026, 9, 31, 23, 59))).toBe('2026-10');
  });

  it('completa com zero', () => {
    expect(localISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
