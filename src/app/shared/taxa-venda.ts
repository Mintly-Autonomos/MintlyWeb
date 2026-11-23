/**
 * Uma regra só para "Taxas" (reteste 22/11, T4): o Resultado, Custos e Receitas usam esta função para decidir o que é
 * taxa de venda. Antes o Resultado somava as categorias de taxa lançadas como despesa (ex.: "Taxas de cartão e
 * iFood", "Aluguel da maquininha") e Custos as punha em "Outras despesas": o mesmo mês dava R$ 9.692,41 numa tela e
 * R$ 9.612,61 na outra.
 *
 * É taxa de venda:
 * - a comissão dos apps e a taxa da maquininha calculadas pelas contas (`platformFee` / `cardFee`);
 * - a despesa em categoria de despesa operacional cujo nome diz taxa, tarifa, comissão ou maquininha.
 */

/** Categoria de despesa que é taxa de venda (cartão, app, maquininha), pelo nome. */
export function ehCategoriaDeTaxa(nome: string): boolean {
  return /\b(taxas?|tarifas?|comiss(ã|a)o|comiss(õ|o)es|maquininha)\b/i.test(nome);
}

/** Item de despesa (do Resultado ou de Custos) que entra em "Taxas". */
export function ehTaxaDeVenda(item: {
  kind: string;
  name: string;
  dreGroup?: string | null;
}): boolean {
  if (item.kind === 'platformFee' || item.kind === 'cardFee') return true;
  // CMV, mão de obra e imposto têm grupo próprio: o nome não tira a categoria de lá.
  if (item.dreGroup && item.dreGroup !== 'opex') return false;
  // No Resultado a categoria vem como 'opex' (ou 'labor'); em Custos, como 'category'.
  return (item.kind === 'opex' || item.kind === 'category') && ehCategoriaDeTaxa(item.name);
}
