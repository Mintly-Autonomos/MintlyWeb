export interface ApiErrorInfo {
  status?: number;
  code?: string;
  message?: string;
}

/**
 * Lê status, código e mensagem de um erro de chamada à API, em QUALQUER um dos dois formatos que chegam:
 *
 * - `ApiError` da mintly-lib: quando a resposta de erro traz `{ code, message }` (quase todo erro da API) a lib
 *   troca o erro do axios por `ApiError { status, code, message }`, **sem** `response`;
 * - `AxiosError` cru (`response.status`, `response.data`): erro sem corpo reconhecível ou mocks de teste.
 *
 * Ler só `err.response.status` (como vários trechos antigos fazem) perde o status de todo erro com corpo.
 */
export function apiErrorInfo(err: unknown): ApiErrorInfo {
  if (typeof err !== 'object' || err === null) return {};
  const e = err as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: { code?: unknown; message?: unknown } };
  };

  const fromApiError = typeof e.status === 'number';
  const status = fromApiError
    ? (e.status as number)
    : typeof e.response?.status === 'number'
      ? e.response.status
      : undefined;
  const code =
    typeof e.response?.data?.code === 'string'
      ? e.response.data.code
      : fromApiError && typeof e.code === 'string'
        ? e.code
        : undefined;
  const message =
    typeof e.response?.data?.message === 'string'
      ? e.response.data.message
      : fromApiError && typeof e.message === 'string' && e.message
        ? e.message
        : undefined;

  return { status, code, message };
}
