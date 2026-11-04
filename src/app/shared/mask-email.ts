/**
 * Esconde parte do e-mail para mostrar na tela sem expô-lo inteiro: "soma.pratos@mintly.test" vira
 * "so***@mintly.test". Mantém o começo (para a pessoa reconhecer) e o domínio inteiro.
 */
export function maskEmail(email: string): string {
  const value = email.trim();
  if (!value) return '';
  const at = value.lastIndexOf('@');
  const local = at > 0 ? value.slice(0, at) : value;
  const domain = at > 0 ? value.slice(at) : '';
  const visible = local.length > 3 ? 2 : 1;
  return `${local.slice(0, visible)}***${domain}`;
}
