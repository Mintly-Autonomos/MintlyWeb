export interface PasswordRule {
  label: string;
  ok: boolean;
}

/**
 * Política de senha do sistema (fonte única): mínimo 8 caracteres, ao menos
 * 1 maiúscula, 1 minúscula e 1 número/símbolo. Reusada no cadastro e na
 * redefinição de senha — espelha o `passwordSchema` da mintly-lib (MIN-58/59).
 */
export function passwordRules(p: string): PasswordRule[] {
  return [
    { label: 'Mínimo 8 caracteres', ok: p.length >= 8 },
    { label: 'Letra maiúscula', ok: /[A-Z]/.test(p) },
    { label: 'Letra minúscula', ok: /[a-z]/.test(p) },
    { label: 'Número ou símbolo', ok: /[\d\W]/.test(p) },
  ];
}
