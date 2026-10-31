import { apiErrorInfo } from './api-error';

/** Erro sem resposta da API: rede caiu, servidor fora do ar ou o pedido passou do tempo. */
export function isNoResponseError(err: unknown): boolean {
  return (
    err instanceof Error &&
    apiErrorInfo(err).status === undefined &&
    !!(err as { isAxiosError?: boolean }).isAxiosError
  );
}

/**
 * Texto de erro para a pessoa: o que a API respondeu (ex.: "Já existe uma conta com este nome"); sem
 * resposta, uma frase sobre a conexão; e só em último caso o texto genérico da tela.
 */
export function apiErrorMessage(
  err: unknown,
  fallback = 'Não foi possível concluir a operação. Tente novamente.',
): string {
  const { message, status } = apiErrorInfo(err);
  if (message) return message;
  if (isNoResponseError(err)) {
    return 'Não conseguimos falar com o servidor (conexão caiu ou demorou demais). Confira sua internet e tente de novo.';
  }
  if (status === 429)
    return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.';
  return fallback;
}
