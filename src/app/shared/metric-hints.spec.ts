import { CMV_HINT, METRIC_HINTS, PRIME_COST_HINT } from './metric-hints';

// P.1 do relatório Sweetie Bel: todo "?" de número e gráfico diz o que é e como se calcula.

describe('textos do "?" (P.1)', () => {
  const todos = { CMV_HINT, PRIME_COST_HINT, ...METRIC_HINTS };

  it.each(Object.entries(todos))('%s tem a definição e a fórmula', (_chave, texto) => {
    const [definicao, formula] = texto.split(' Como se calcula: ');
    expect(definicao.length).toBeGreaterThan(15);
    expect(formula?.length ?? 0).toBeGreaterThan(10);
    expect(texto.endsWith('.')).toBe(true);
  });

  it('as contas usam os mesmos nomes das telas', () => {
    expect(METRIC_HINTS.lucroMes).toContain(
      'receita bruta − impostos sobre a venda − CMV − despesas operacionais',
    );
    expect(METRIC_HINTS.saldoPrevisto).toContain('caixa hoje + a receber − a pagar');
    expect(METRIC_HINTS.ticketMedio).toContain('receita bruta ÷ número de vendas');
    expect(PRIME_COST_HINT).toContain(
      '(CMV + despesas das categorias do grupo Pessoal) ÷ receita bruta',
    );
  });
});
