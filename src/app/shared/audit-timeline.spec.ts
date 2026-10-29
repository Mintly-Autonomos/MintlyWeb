import { auditActionLabel } from './audit-timeline.component';

describe('auditActionLabel', () => {
  it('traduz os códigos que a API grava no histórico', () => {
    expect(auditActionLabel('set-default')).toBe('Definida como conta padrão');
    expect(auditActionLabel('unset-default')).toBe('Deixou de ser a conta padrão');
    expect(auditActionLabel('inactivate')).toBe('Inativada');
    expect(auditActionLabel('reactivate')).toBe('Reativada');
    expect(auditActionLabel('update')).toBe('Dados atualizados');
    expect(auditActionLabel('register')).toBe('Criada');
  });

  it('ignora caixa e espaços no código', () => {
    expect(auditActionLabel('  Inactivate '.replace('Inactivate', 'INACTIVATE'))).toBe('Inativada');
  });

  it('o que não é código conhecido passa como veio', () => {
    expect(auditActionLabel('Taxa alterada')).toBe('Taxa alterada');
    expect(auditActionLabel('algo-novo')).toBe('algo-novo');
  });
});
