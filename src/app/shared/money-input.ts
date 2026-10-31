/**
 * Campo de dinheiro digitado à mão: milhar com ponto e centavos com vírgula, como no Brasil.
 * Quem digita 14500 vê 14.500; ao digitar ",5" vê 14.500,5. Aceita colar "R$ 1.234,56" e "1234.56".
 * O texto devolvido é o mesmo que `parseNumberBR` lê de volta ("14.500,50" -> 14500.5).
 */
export function formatMoneyInput(raw: string): string {
  let text = raw.replace(/R\$|\s/g, '');
  // "1234.56" (ponto como decimal, sem vírgula e com 1 ou 2 casas no fim): vira vírgula.
  if (!text.includes(',') && /^\d+\.\d{1,2}$/.test(text)) text = text.replace('.', ',');
  const comma = text.indexOf(',');
  const intDigits = (comma >= 0 ? text.slice(0, comma) : text)
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '');
  const decimals =
    comma >= 0
      ? text
          .slice(comma + 1)
          .replace(/\D/g, '')
          .slice(0, 2)
      : '';
  const integer = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (comma < 0) return integer;
  return `${integer || '0'},${decimals}`;
}

/**
 * Completa as casas decimais ao sair do campo: "145" -> "145,00", "14500,5" -> "14.500,50", ",5" -> "0,50".
 * Campo vazio continua vazio (a pessoa ainda não preencheu).
 */
export function padMoneyInput(raw: string): string {
  const text = formatMoneyInput(raw);
  if (!text) return '';
  const [integer, decimals = ''] = text.split(',');
  return `${integer || '0'},${decimals.padEnd(2, '0')}`;
}

/** Número vindo do cadastro (ex.: 14500.5) -> texto do campo ("14.500,50"). */
export function moneyToInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const [int, dec] = value.toFixed(2).split('.');
  return `${formatMoneyInput(int)},${dec}`;
}
