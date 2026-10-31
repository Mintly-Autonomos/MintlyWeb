import { apiErrorMessage, isNoResponseError } from './api-error-message';

describe('apiErrorMessage', () => {
  it('usa a mensagem que a API devolveu (ApiError da lib)', () => {
    const err = Object.assign(
      new Error('Já existe uma conta com este nome e tipo neste restaurante.'),
      { code: 'AUTH-0002', status: 409 },
    );
    expect(apiErrorMessage(err)).toBe(
      'Já existe uma conta com este nome e tipo neste restaurante.',
    );
  });

  it('usa a mensagem do AxiosError cru também', () => {
    expect(
      apiErrorMessage({ response: { status: 400, data: { message: 'Valor inválido.' } } }),
    ).toBe('Valor inválido.');
  });

  it('sem resposta (rede/tempo esgotado): fala da conexão, não do genérico', () => {
    const net = Object.assign(new Error('timeout of 15000ms exceeded'), {
      isAxiosError: true,
      code: 'ECONNABORTED',
    });
    expect(isNoResponseError(net)).toBe(true);
    expect(apiErrorMessage(net)).toContain('conexão');
  });

  it('429 fala de muitas tentativas', () => {
    expect(apiErrorMessage({ response: { status: 429 } })).toContain('Muitas tentativas');
  });

  it('erro qualquer cai no texto da tela', () => {
    expect(apiErrorMessage(new Error('x'), 'Não deu.')).toBe('Não deu.');
    expect(apiErrorMessage(undefined)).toContain('Não foi possível concluir');
  });
});
