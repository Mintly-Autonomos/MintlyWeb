import { apiErrorInfo } from './api-error';

describe('apiErrorInfo', () => {
  it('ApiError da lib (status/code/message direto, sem response)', () => {
    const err = Object.assign(new Error('Assinatura necessária.'), {
      code: 'SUBSCRIPTION-0001',
      status: 402,
    });
    expect(apiErrorInfo(err)).toEqual({
      status: 402,
      code: 'SUBSCRIPTION-0001',
      message: 'Assinatura necessária.',
    });
  });

  it('AxiosError cru (response.status e response.data)', () => {
    const err = { response: { status: 409, data: { code: 'AUTH-0002', message: 'Conflito.' } } };
    expect(apiErrorInfo(err)).toEqual({ status: 409, code: 'AUTH-0002', message: 'Conflito.' });
  });

  it('AxiosError sem corpo: só o status', () => {
    expect(apiErrorInfo({ response: { status: 500 } })).toEqual({
      status: 500,
      code: undefined,
      message: undefined,
    });
  });

  it('erro de rede (sem status): nada de status nem código da API', () => {
    const net = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    expect(apiErrorInfo(net)).toEqual({ status: undefined, code: undefined, message: undefined });
  });

  it('o código do AxiosError (ex.: ERR_NETWORK) não é confundido com o código da API', () => {
    expect(apiErrorInfo({ code: 'ECONNABORTED', message: 'timeout' }).code).toBeUndefined();
  });

  it('valores que não são erro devolvem vazio', () => {
    expect(apiErrorInfo(null)).toEqual({});
    expect(apiErrorInfo(undefined)).toEqual({});
    expect(apiErrorInfo('texto')).toEqual({});
    expect(apiErrorInfo(42)).toEqual({});
  });

  it('ApiError com mensagem vazia não vira mensagem', () => {
    const err = Object.assign(new Error(''), { code: 'APP-0001', status: 404 });
    expect(apiErrorInfo(err).message).toBeUndefined();
  });

  it('status que não é número é ignorado', () => {
    expect(apiErrorInfo({ status: '402', response: { status: '402' } }).status).toBeUndefined();
  });
});
