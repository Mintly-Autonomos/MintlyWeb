import { COMMON_STEPS, PAGE_STEPS, pageKey, stepsForPage } from './tour-steps';

const TELAS = [
  'visao-geral',
  'fluxo-de-caixa',
  'receitas',
  'custos',
  'resultado',
  'previsoes',
  'movimentacoes',
  'cardapio',
  'contas',
  'categorias',
];

describe('pageKey', () => {
  it('pega o primeiro trecho da rota, sem query nem âncora', () => {
    expect(pageKey('/movimentacoes')).toBe('movimentacoes');
    expect(pageKey('/movimentacoes?mes=2026-10#tabela')).toBe('movimentacoes');
    expect(pageKey('/visao-geral/')).toBe('visao-geral');
    expect(pageKey('/')).toBe('');
    expect(pageKey('')).toBe('');
  });
});

describe('passos do tutorial', () => {
  it.each(TELAS)('%s tem passos próprios', (tela) => {
    expect(PAGE_STEPS[tela]?.length).toBeGreaterThanOrEqual(3);
  });

  it('a página vem primeiro e os passos comuns (menu e cabeçalho) vêm no fim', () => {
    const passos = stepsForPage('/receitas');
    expect(passos.slice(0, PAGE_STEPS['receitas'].length)).toEqual(PAGE_STEPS['receitas']);
    expect(passos.slice(-COMMON_STEPS.length)).toEqual(COMMON_STEPS);
    expect(passos.at(-1)?.target).toBe('ajuda');
  });

  it('tela sem passos próprios ainda tem os comuns', () => {
    expect(stepsForPage('/qualquer-coisa')).toEqual(COMMON_STEPS);
  });

  it('todo passo tem título e texto, e nenhum alvo se repete dentro de um tutorial', () => {
    for (const tela of TELAS) {
      const passos = stepsForPage('/' + tela);
      for (const p of passos) {
        expect(p.title.trim()).not.toBe('');
        expect(p.text.trim().length).toBeGreaterThan(20);
        expect(p.target).toMatch(/^[a-z-]+$/);
      }
      const alvos = passos.map((p) => p.target);
      expect(new Set(alvos).size).toBe(alvos.length);
    }
  });
});
