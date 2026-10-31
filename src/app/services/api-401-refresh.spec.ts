import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { CardapioService } from './cardapio.service';
import { CategoriasService } from './categorias.service';
import { ContasService } from './contas.service';
import { CustosService } from './custos.service';
import { DashboardService } from './dashboard.service';
import { FluxoCaixaService } from './fluxo-caixa.service';
import { MovimentacoesService } from './movimentacoes.service';
import { PrevisoesService } from './previsoes.service';
import { ReceitasService } from './receitas.service';
import { RestauranteService } from './restaurante.service';
import { ResultadoService } from './resultado.service';

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

/** Erro como a mintly-lib entrega quando a API responde com { code, message }: SEM `response`. */
const apiError = (status: number) =>
  Object.assign(new Error('Token expirado.'), { code: 'AUTH-0001', status });

import type { ProviderToken } from '@angular/core';

const SERVICES: ProviderToken<unknown>[] = [
  CardapioService,
  CategoriasService,
  ContasService,
  CustosService,
  DashboardService,
  FluxoCaixaService,
  MovimentacoesService,
  PrevisoesService,
  ReceitasService,
  RestauranteService,
  ResultadoService,
];

describe('401 da API: renova o token e tenta de novo (erro no formato da lib)', () => {
  let refresh: ReturnType<typeof vi.fn>;
  let onApiError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    refresh = vi.fn().mockResolvedValue(true);
    // 402 (assinatura vencida): o AuthService decide se leva à tela de assinatura.
    onApiError = vi.fn().mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            getAccessToken: () => 'token',
            refresh,
            onApiError,
            currentUser: () => ({ nome: 'Dono' }),
          },
        },
      ],
    });
  });

  it.each(SERVICES.map((s) => [(s as { name: string }).name, s] as const))(
    '%s: 401 -> refresh -> repete a chamada',
    async (_name, ServiceClass) => {
      const svc = TestBed.inject(ServiceClass) as unknown as {
        call: <T>(fn: (h: unknown) => Promise<T>) => Promise<T>;
      };
      const fn = vi.fn().mockRejectedValueOnce(apiError(401)).mockResolvedValueOnce('ok');

      await expect(svc.call(fn)).resolves.toBe('ok');

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(2);
    },
  );

  it('assinatura vencida (402): o erro é repassado ao AuthService, que leva à tela de assinatura', async () => {
    const svc = TestBed.inject(ContasService) as unknown as {
      call: <T>(fn: (h: unknown) => Promise<T>) => Promise<T>;
    };
    const err = Object.assign(new Error('Assinatura necessária.'), {
      code: 'SUBSCRIPTION-0001',
      status: 402,
    });
    await expect(svc.call(() => Promise.reject(err))).rejects.toBe(err);
    expect(onApiError).toHaveBeenCalledWith(err);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('outros erros (ex.: 409) sobem sem renovar token', async () => {
    const svc = TestBed.inject(ContasService) as unknown as {
      call: <T>(fn: (h: unknown) => Promise<T>) => Promise<T>;
    };
    const err = apiError(409);
    await expect(svc.call(() => Promise.reject(err))).rejects.toBe(err);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('o formato antigo (AxiosError com response.status) continua funcionando', async () => {
    const svc = TestBed.inject(ContasService) as unknown as {
      call: <T>(fn: (h: unknown) => Promise<T>) => Promise<T>;
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce('ok');
    await expect(svc.call(fn)).resolves.toBe('ok');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
