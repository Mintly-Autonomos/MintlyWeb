/** Mais que isso passa de R$ 9.999.999.999,99 e nenhum restaurante chega lá: evita número gigante por engano. */
const MAX_DIGITS = 12;

/**
 * Campo de dinheiro estilo caixa eletrônico: cada dígito entra pela direita, a partir dos centavos.
 * Quem digita 4 vê 0,04; depois 5 vê 0,45; depois 1 vê 4,51. Só os dígitos contam: o resto
 * (vírgula, ponto, "R$", letras) é ignorado e o texto é refeito com milhar em ponto e vírgula nos centavos.
 * Sem nenhum dígito o campo fica vazio, para o "0,00" do placeholder aparecer.
 */
export function formatMoneyInput(raw: string): string {
  if (!/\d/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS).padStart(3, '0');
  const integer = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${integer},${digits.slice(-2)}`;
}

/**
 * Texto colado: lê como número, e não como centavos ("145" -> "145,00", "R$ 1.234,5" -> "1.234,50",
 * "1234.56" -> "1.234,56"). Só a colagem faz isso; digitar continua centavos primeiro.
 */
export function pasteMoneyInput(raw: string): string {
  if (!/\d/.test(raw)) return '';
  let text = raw.replace(/R\$|\s/g, '');
  // "1234.56" (ponto como decimal, sem vírgula e com 1 ou 2 casas no fim): vira vírgula.
  if (!text.includes(',') && /^\d+\.\d{1,2}$/.test(text)) text = text.replace('.', ',');
  const comma = text.indexOf(',');
  const integer = (comma >= 0 ? text.slice(0, comma) : text).replace(/\D/g, '');
  const decimals = (comma >= 0 ? text.slice(comma + 1) : '').replace(/\D/g, '').slice(0, 2);
  return formatMoneyInput(`${integer}${decimals.padEnd(2, '0')}`);
}

/** Número vindo do cadastro (ex.: 14500.5) -> texto do campo ("14.500,50"). */
export function moneyToInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return formatMoneyInput(String(Math.round(Math.abs(value) * 100)));
}
