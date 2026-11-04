import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ContaService } from './conta.service';
import { MintlyClientService } from './mintly-client.service';

const flags = environment as { useMocks: boolean };
const ok = (payload: unknown) => Promise.resolve({ payload });
const httpError = (status: number, message = 'erro') => ({
  response: { status, data: { message } },
});

describe('ContaService', () => {
  let svc: ContaService;
  let router: Router;
  let userClient: Record<string, ReturnType<typeof vi.fn>>;
  let restaurantClient: Record<string, ReturnType<typeof vi.fn>>;
  let personClient: Record<string, ReturnType<typeof vi.fn>>;
  let auth: {
    getAccessToken: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    setCompanyName: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    flags.useMocks = false;
    userClient = {
      getMe: vi.fn(),
      updateMe: vi.fn(),
      changeEmail: vi.fn(),
      changePassword: vi.fn(),
    };
    restaurantClient = {
      me: vi.fn(),
      updateMe: vi.fn(),
      listMembers: vi.fn(),
      createMember: vi.fn(),
      updateMember: vi.fn(),
      requestDeletion: vi.fn(),
      cancelDeletion: vi.fn(),
    };
    personClient = { getAvatarByUsername: vi.fn(() => ok({ avatar: null })) };
    auth = {
      getAccessToken: vi.fn(() => 'token'),
      refresh: vi.fn(() => Promise.resolve(true)),
      logout: vi.fn(() => Promise.resolve()),
      setCompanyName: vi.fn(),
      currentUser: vi.fn(() => ({ nome: 'Davi', email: 'davi@teste.com' })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: MintlyClientService,
          useValue: { client: { userClient, restaurantClient, personClient } },
        },
      ],
    });
    svc = TestBed.inject(ContaService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    flags.useMocks = false;
  });

  const conta = { name: 'Davi Lee', email: 'davi@teste.com', phone: '11999990000', role: 'owner' };

  it('carrega a conta (nome, e-mail, telefone e papel)', async () => {
    userClient['getMe'].mockReturnValue(ok(conta));
    await svc.carregarConta();
    expect(svc.dados()).toEqual({
      nome: 'Davi Lee',
      email: 'davi@teste.com',
      telefone: '11999990000',
      papel: 'owner',
    });
    expect(userClient['getMe']).toHaveBeenCalledWith({
      env: environment.mintlyEnv,
      authorization: 'Bearer token',
    });
  });

  it('funcionário vem como member', async () => {
    userClient['getMe'].mockReturnValue(ok({ ...conta, role: 'member' }));
    await svc.carregarConta();
    expect(svc.dados()?.papel).toBe('member');
  });

  it('salvar dados manda só o que mudou e guarda a resposta', async () => {
    userClient['updateMe'].mockReturnValue(ok({ ...conta, name: 'Davi L.' }));
    await svc.salvarDados({ nome: 'Davi L.' });
    expect(userClient['updateMe'].mock.calls[0][0]).toEqual({ name: 'Davi L.' });
    expect(svc.dados()?.nome).toBe('Davi L.');

    userClient['updateMe'].mockReturnValue(ok({ ...conta, phone: '11888880000' }));
    await svc.salvarDados({ telefone: '11888880000' });
    expect(userClient['updateMe'].mock.calls[1][0]).toEqual({ phone: '11888880000' });
  });

  it('trocar e-mail envia o novo e a senha atual', async () => {
    userClient['changeEmail'].mockReturnValue(ok({ ...conta, email: 'novo@teste.com' }));
    await svc.trocarEmail('novo@teste.com', 'Senha123');
    expect(userClient['changeEmail'].mock.calls[0][0]).toEqual({
      email: 'novo@teste.com',
      currentPassword: 'Senha123',
    });
    expect(svc.dados()?.email).toBe('novo@teste.com');
  });

  it('trocar senha chama a API, encerra a sessão e leva ao login avisando', async () => {
    userClient['changePassword'].mockReturnValue(ok({ message: 'ok' }));
    await svc.trocarSenha('Antiga123', 'Nova12345');
    expect(userClient['changePassword'].mock.calls[0][0]).toEqual({
      currentPassword: 'Antiga123',
      newPassword: 'Nova12345',
    });
    expect(auth.logout).toHaveBeenCalledWith(false);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login'], { queryParams: { reset: 'ok' } });
  });

  it('senha atual errada (403): o erro sobe, a sessão continua e NÃO tenta renovar o token', async () => {
    userClient['changePassword'].mockRejectedValue(httpError(403, 'Senha incorreta.'));
    await expect(svc.trocarSenha('Errada123', 'Nova12345')).rejects.toBeDefined();
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('401: renova o token uma vez e repete a chamada', async () => {
    userClient['getMe'].mockRejectedValueOnce(httpError(401)).mockReturnValueOnce(ok(conta));
    await svc.carregarConta();
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(userClient['getMe']).toHaveBeenCalledTimes(2);
    expect(svc.dados()?.nome).toBe('Davi Lee');
  });

  it('401 sem conseguir renovar leva à tela de sessão expirada', async () => {
    auth.refresh.mockResolvedValue(false);
    userClient['getMe'].mockRejectedValue(httpError(401));
    await expect(svc.carregarConta()).rejects.toBeDefined();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/sessao-expirada']);
  });

  describe('restaurante', () => {
    it('carrega o nome e o pedido de exclusão', async () => {
      restaurantClient['me'].mockReturnValue(
        ok({ restaurant: { name: 'Cantina', deletionRequestedAt: '2026-11-03T12:00:00.000Z' } }),
      );
      await svc.carregarRestaurante();
      expect(svc.restaurante()).toBe('Cantina');
      expect(svc.exclusaoPedidaEm()).toBe('2026-11-03T12:00:00.000Z');
    });

    it('sem pedido de exclusão fica nulo', async () => {
      restaurantClient['me'].mockReturnValue(ok({ restaurant: { name: 'Cantina' } }));
      await svc.carregarRestaurante();
      expect(svc.exclusaoPedidaEm()).toBeNull();
    });

    it('renomear grava só o nome e já atualiza o nome no menu da conta', async () => {
      restaurantClient['updateMe'].mockReturnValue(ok({ name: 'Cantina Nova' }));
      await svc.renomearRestaurante('Cantina Nova');
      expect(restaurantClient['updateMe'].mock.calls[0][0]).toEqual({ name: 'Cantina Nova' });
      expect(svc.restaurante()).toBe('Cantina Nova');
      expect(auth.setCompanyName).toHaveBeenCalledWith('Cantina Nova');
    });
  });

  describe('funcionários', () => {
    const lista = [
      { _id: 'm1', name: 'Ana', email: 'ana@teste.com', status: 'active' },
      { _id: 'm2', name: 'Bia', email: 'bia@teste.com', status: 'inactive' },
    ];

    it('lista com o formato da tela', async () => {
      restaurantClient['listMembers'].mockReturnValue(ok(lista));
      await svc.carregarMembros();
      expect(svc.membros()).toEqual([
        { id: 'm1', nome: 'Ana', email: 'ana@teste.com', status: 'active' },
        { id: 'm2', nome: 'Bia', email: 'bia@teste.com', status: 'inactive' },
      ]);
    });

    it('traz a foto de cada funcionário (busca pelo e-mail dele); sem foto fica sem o campo', async () => {
      restaurantClient['listMembers'].mockReturnValue(ok(lista));
      personClient['getAvatarByUsername'].mockImplementation((email: string) =>
        ok({ avatar: email === 'ana@teste.com' ? 'data:image/png;base64,AAA' : null }),
      );
      await svc.carregarMembros();
      expect(personClient['getAvatarByUsername']).toHaveBeenCalledWith('ana@teste.com', {
        env: environment.mintlyEnv,
        authorization: 'Bearer token',
      });
      expect(svc.membros()[0].foto).toBe('data:image/png;base64,AAA');
      expect('foto' in svc.membros()[1]).toBe(false);
    });

    it('foto que não carrega não derruba a lista (o funcionário aparece sem foto)', async () => {
      restaurantClient['listMembers'].mockReturnValue(ok(lista));
      personClient['getAvatarByUsername'].mockRejectedValue(httpError(500));
      await svc.carregarMembros();
      expect(svc.membros()).toHaveLength(2);
      expect(svc.membros()[0].foto).toBeUndefined();
    });

    it('depois de adicionar/alterar alguém só busca a foto de quem ainda não tinha; ao reabrir busca todas de novo', async () => {
      restaurantClient['listMembers'].mockReturnValue(ok(lista));
      restaurantClient['createMember'].mockReturnValue(ok(lista[0]));
      await svc.carregarMembros();
      expect(personClient['getAvatarByUsername']).toHaveBeenCalledTimes(2);

      await svc.adicionarMembro({ nome: 'Ana', email: 'ana@teste.com', senha: 'Func12345' });
      expect(personClient['getAvatarByUsername']).toHaveBeenCalledTimes(2);

      await svc.carregarMembros();
      expect(personClient['getAvatarByUsername']).toHaveBeenCalledTimes(4);
    });

    it('adicionar manda nome, e-mail e senha e recarrega a lista', async () => {
      restaurantClient['createMember'].mockReturnValue(ok(lista[0]));
      restaurantClient['listMembers'].mockReturnValue(ok(lista));
      await svc.adicionarMembro({ nome: 'Ana', email: 'ana@teste.com', senha: 'Func12345' });
      expect(restaurantClient['createMember'].mock.calls[0][0]).toEqual({
        name: 'Ana',
        email: 'ana@teste.com',
        password: 'Func12345',
      });
      expect(svc.membros()).toHaveLength(2);
    });

    it('inativar e definir senha vão no mesmo PATCH, com o status no formato da lib', async () => {
      restaurantClient['updateMember'].mockReturnValue(ok(lista[0]));
      restaurantClient['listMembers'].mockReturnValue(ok(lista));
      await svc.atualizarMembro('m1', { status: 'inactive' });
      await svc.atualizarMembro('m1', { senha: 'NovaSenha77' });
      expect(restaurantClient['updateMember'].mock.calls[0]).toEqual([
        'm1',
        { status: 'inactive' },
        expect.anything(),
      ]);
      expect(restaurantClient['updateMember'].mock.calls[1]).toEqual([
        'm1',
        { password: 'NovaSenha77' },
        expect.anything(),
      ]);
    });
  });

  describe('pedido de exclusão', () => {
    it('manda a senha e o motivo (sem espaços nas pontas) e guarda a data', async () => {
      restaurantClient['requestDeletion'].mockReturnValue(
        ok({ deletionRequestedAt: '2026-11-03T12:00:00.000Z' }),
      );
      await svc.pedirExclusao('Senha123', '  Fechei  ');
      expect(restaurantClient['requestDeletion'].mock.calls[0][0]).toEqual({
        password: 'Senha123',
        reason: 'Fechei',
      });
      expect(svc.exclusaoPedidaEm()).toBe('2026-11-03T12:00:00.000Z');
    });

    it('sem motivo não manda o campo', async () => {
      restaurantClient['requestDeletion'].mockReturnValue(
        ok({ deletionRequestedAt: '2026-11-03T12:00:00.000Z' }),
      );
      await svc.pedirExclusao('Senha123', '   ');
      expect(restaurantClient['requestDeletion'].mock.calls[0][0]).toEqual({
        password: 'Senha123',
      });
    });

    it('cancelar limpa o pedido', async () => {
      restaurantClient['requestDeletion'].mockReturnValue(
        ok({ deletionRequestedAt: '2026-11-03T12:00:00.000Z' }),
      );
      restaurantClient['cancelDeletion'].mockReturnValue(ok({ deletionRequestedAt: null }));
      await svc.pedirExclusao('Senha123');
      await svc.cancelarExclusao();
      expect(svc.exclusaoPedidaEm()).toBeNull();
    });
  });

  it('no modo demonstração (useMocks) não chama a API', async () => {
    flags.useMocks = true;
    await svc.carregarConta();
    await svc.carregarMembros();
    expect(userClient['getMe']).not.toHaveBeenCalled();
    expect(restaurantClient['listMembers']).not.toHaveBeenCalled();
    expect(svc.dados()?.papel).toBe('owner');
  });
});
