import { podeAlterarMovimento } from './movimentacoes.component';
import { ehTelaDeRelatorio } from '../../layout/app-layout.component';

// Problemas 23/11 (decisões do Nathan): o perfil Operação só altera o que lançou, no mês atual.
describe('podeAlterarMovimento', () => {
  const hoje = '2026-11-23';
  it('dono e Gerente alteram tudo', () => {
    expect(
      podeAlterarMovimento(
        { createdById: 'dona', date: '2026-10-05' },
        { podeTudo: true, eu: 'u1', hoje },
      ),
    ).toBe(true);
  });
  it('Operação: só o próprio lançamento do mês atual', () => {
    const p = { podeTudo: false, eu: 'u1', hoje };
    expect(podeAlterarMovimento({ createdById: 'u1', date: '2026-11-21' }, p)).toBe(true);
    expect(podeAlterarMovimento({ createdById: 'dona', date: '2026-11-21' }, p)).toBe(false);
    expect(podeAlterarMovimento({ createdById: 'u1', date: '2026-10-31' }, p)).toBe(false);
    expect(podeAlterarMovimento({ date: '2026-11-21' }, { ...p, eu: null })).toBe(false);
  });
});

describe('ehTelaDeRelatorio (perfil rebaixado sai da tela, item 19)', () => {
  it('reconhece as telas de relatório, com filtro na URL', () => {
    expect(ehTelaDeRelatorio('/receitas')).toBe(true);
    expect(ehTelaDeRelatorio('/visao-geral?mes=2026-10')).toBe(true);
    expect(ehTelaDeRelatorio('/movimentacoes')).toBe(false);
    expect(ehTelaDeRelatorio('/receitasx')).toBe(false);
  });
});
