import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('mostra o começo e o domínio, escondendo o resto do nome', () => {
    expect(maskEmail('soma.pratos@mintly.test')).toBe('so***@mintly.test');
    expect(maskEmail('davi@teste.com')).toBe('da***@teste.com');
  });

  it('nome curto mostra só a primeira letra', () => {
    expect(maskEmail('ana@x.com')).toBe('a***@x.com');
    expect(maskEmail('al@x.com')).toBe('a***@x.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
  });

  it('nunca devolve o nome inteiro do e-mail', () => {
    for (const e of [
      'soma.pratos@mintly.test',
      'davi@teste.com',
      'maria.silva@restaurante.com.br',
    ]) {
      const local = e.slice(0, e.indexOf('@'));
      expect(maskEmail(e)).not.toContain(local);
    }
  });

  it('com mais de um @ usa o último como separador do domínio', () => {
    expect(maskEmail('a@b@dominio.com')).toBe('a***@dominio.com');
  });

  it('texto sem @ e vazio não quebram', () => {
    expect(maskEmail('semarroba')).toBe('se***');
    expect(maskEmail('')).toBe('');
    expect(maskEmail('   ')).toBe('');
  });
});
