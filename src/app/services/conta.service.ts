import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { accessLevelOf, MemberProfile, MemberStatus } from 'mintly-lib';
import type { Headers, MyAccount, RestaurantMember } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { apiErrorInfo } from '../shared/api-error';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';

/** `invited`: convite enviado, o funcionário ainda não criou a senha (E.1). */
export type MemberStatusKey = 'active' | 'inactive' | 'invited';
/** Perfil do funcionário (E.3): Operação ou Gerente. */
export type PerfilMembro = 'operations' | 'manager';

/** Funcionário como a tela usa (datas já como texto ISO). */
export interface Membro {
  id: string;
  nome: string;
  email: string;
  status: MemberStatusKey;
  perfil: PerfilMembro;
  /** Só com convite pendente: até quando o link vale (ISO). */
  conviteVenceEm?: string;
  /** Foto de perfil do funcionário (data URL); sem foto, a tela mostra as iniciais. */
  foto?: string;
}

export interface ContaDados {
  nome: string;
  email: string;
  telefone: string;
  /** `owner` (dono) ou `member` (funcionário): só o dono vê a parte do restaurante. */
  papel: 'owner' | 'member';
  /** Só funcionário: o perfil (E.3). */
  perfil?: PerfilMembro;
}

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Estado do modo demonstração (`useMocks`): vale só enquanto a aba está aberta. */
/** Pessoa da equipe com a carga semanal do contrato (P.4). Não é login. */
export interface PessoaEquipe {
  nome: string;
  horasSemana: number;
}

/** Reteste 22/11 (T2): o mês de abertura e o faturamento de antes do Mintly, para o RBT12 do Simples. */
export interface AberturaEmpresa {
  /** `AAAA-MM`; "" = não informado. */
  inicio: string;
  faturamentoAntes: { mes: string; valor: number }[];
}

const mock = {
  telefone: '11999990000',
  restaurante: '',
  equipe: null as PessoaEquipe[] | null,
  abertura: { inicio: '', faturamentoAntes: [] } as AberturaEmpresa,
  exclusaoEm: null as string | null,
  membros: [] as Membro[],
};

const toMembro = (m: RestaurantMember): Membro => ({
  id: m._id,
  nome: m.name,
  email: m.email,
  status:
    m.status === MemberStatus.Inactive
      ? 'inactive'
      : m.status === MemberStatus.Invited
        ? 'invited'
        : 'active',
  perfil: m.profile === MemberProfile.Operations ? 'operations' : 'manager',
  ...(m.inviteExpiresAt ? { conviteVenceEm: new Date(m.inviteExpiresAt).toISOString() } : {}),
});

const toDados = (a: MyAccount): ContaDados => ({
  nome: a.name,
  email: a.email,
  telefone: a.phone ?? '',
  papel: a.role === 'member' ? 'member' : 'owner',
  ...(a.role === 'member'
    ? { perfil: a.memberProfile === MemberProfile.Operations ? 'operations' : 'manager' }
    : {}),
});

const PERFIL_TO_LIB: Record<PerfilMembro, MemberProfile> = {
  operations: MemberProfile.Operations,
  manager: MemberProfile.Manager,
};
const STATUS_TO_LIB: Record<'active' | 'inactive', MemberStatus> = {
  active: MemberStatus.Active,
  inactive: MemberStatus.Inactive,
};

/**
 * Conta do usuário e do restaurante (modal "Minha conta"): dados pessoais, e-mail, senha, nome do restaurante,
 * funcionários e pedido de exclusão. O usuário e o restaurante vêm sempre do token; a API é quem confere se
 * quem pede é o dono.
 */
@Injectable({ providedIn: 'root' })
export class ContaService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private client = inject(MintlyClientService).client;

  readonly dados = signal<ContaDados | null>(null);
  readonly restaurante = signal<string>('');
  /** P.4: equipe e horas por semana. `null` = nunca informada. */
  readonly equipe = signal<PessoaEquipe[] | null>(null);
  /** T2: início da atividade e faturamento antes do Mintly. */
  readonly abertura = signal<AberturaEmpresa>({ inicio: '', faturamentoAntes: [] });
  readonly membros = signal<Membro[]>([]);
  /** Quando o dono pediu a exclusão do restaurante (ISO); `null` = sem pedido. */
  readonly exclusaoPedidaEm = signal<string | null>(null);
  readonly carregando = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Chamada autenticada: em 401 renova o token uma vez e tenta de novo (o 403 de "senha incorreta" passa direto). */
  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (apiErrorInfo(err).status === 401) {
        if (await this.auth.refresh()) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  async carregarConta(): Promise<void> {
    if (environment.useMocks) {
      const u = this.auth.currentUser();
      this.dados.set({
        nome: u?.nome ?? 'Dono',
        email: u?.email ?? '',
        telefone: mock.telefone,
        papel: 'owner',
      });
      return;
    }
    const res = await this.call((h) => this.client.userClient.getMe(h));
    if (res.payload) {
      this.dados.set(toDados(res.payload));
      // O menu e as telas seguem o perfil atual (o dono pode ter mudado depois do login).
      this.auth.setAccessLevel(accessLevelOf(res.payload));
    }
  }

  async salvarDados(mudancas: { nome?: string; telefone?: string }): Promise<void> {
    if (environment.useMocks) {
      await delay();
      if (mudancas.telefone !== undefined) mock.telefone = mudancas.telefone;
      this.dados.update((d) =>
        d ? { ...d, nome: mudancas.nome ?? d.nome, telefone: mudancas.telefone ?? d.telefone } : d,
      );
      return;
    }
    const res = await this.call((h) =>
      this.client.userClient.updateMe(
        {
          ...(mudancas.nome !== undefined ? { name: mudancas.nome } : {}),
          ...(mudancas.telefone !== undefined ? { phone: mudancas.telefone } : {}),
        },
        h,
      ),
    );
    if (res.payload) this.dados.set(toDados(res.payload));
  }

  async trocarEmail(email: string, senhaAtual: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      this.dados.update((d) => (d ? { ...d, email } : d));
      return;
    }
    const res = await this.call((h) =>
      this.client.userClient.changeEmail({ email, currentPassword: senhaAtual }, h),
    );
    if (res.payload) this.dados.set(toDados(res.payload));
  }

  /**
   * Troca a senha com a antiga. A API encerra TODAS as sessões (inclusive esta): depois do sucesso a pessoa
   * sai e entra de novo com a senha nova.
   */
  async trocarSenha(senhaAtual: string, senhaNova: string): Promise<void> {
    if (!environment.useMocks) {
      await this.call((h) =>
        this.client.userClient.changePassword(
          { currentPassword: senhaAtual, newPassword: senhaNova },
          h,
        ),
      );
    } else {
      await delay();
    }
    await this.auth.logout(false);
    this.router.navigate(['/auth/login'], { queryParams: { reset: 'ok' } });
  }

  // ── restaurante (só o dono) ──

  async carregarRestaurante(): Promise<void> {
    if (environment.useMocks) {
      this.restaurante.set(
        mock.restaurante || this.auth.currentUser()?.empresa || 'Meu restaurante',
      );
      this.exclusaoPedidaEm.set(mock.exclusaoEm);
      this.equipe.set(mock.equipe);
      this.abertura.set(mock.abertura);
      return;
    }
    const res = await this.call((h) => this.client.restaurantClient.me({}, h));
    const r = res.payload?.restaurant;
    if (r) {
      this.restaurante.set(r.name);
      this.equipe.set(
        r.team ? r.team.map((p) => ({ nome: p.name, horasSemana: p.weeklyHours })) : null,
      );
      this.abertura.set({
        inicio: r.activityStart ?? '',
        faturamentoAntes: (r.revenueBeforeMintly ?? []).map((x) => ({
          mes: x.month,
          valor: x.amount,
        })),
      });
      const pedido = (r as { deletionRequestedAt?: Date | string }).deletionRequestedAt;
      this.exclusaoPedidaEm.set(pedido ? new Date(pedido).toISOString() : null);
    }
  }

  /** P.4: troca a lista inteira da equipe. */
  async salvarEquipe(lista: PessoaEquipe[]): Promise<void> {
    const team = lista.map((p) => ({ name: p.nome.trim(), weeklyHours: p.horasSemana }));
    if (environment.useMocks) {
      await delay();
      mock.equipe = lista.map((p) => ({ ...p, nome: p.nome.trim() }));
    } else {
      const res = await this.call((h) => this.client.restaurantClient.updateMe({ team }, h));
      const salvo = res.payload?.team;
      if (salvo) {
        this.equipe.set(salvo.map((p) => ({ nome: p.name, horasSemana: p.weeklyHours })));
        return;
      }
    }
    this.equipe.set(team.map((p) => ({ nome: p.name, horasSemana: p.weeklyHours })));
  }

  /** T2: grava o mês de abertura ("" apaga) e troca a lista inteira do faturamento anterior ([] apaga). */
  async salvarAbertura(a: AberturaEmpresa): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.abertura = a;
    } else {
      await this.call((h) =>
        this.client.restaurantClient.updateMe(
          {
            activityStart: a.inicio,
            revenueBeforeMintly: a.faturamentoAntes.map((x) => ({ month: x.mes, amount: x.valor })),
          },
          h,
        ),
      );
    }
    this.abertura.set({
      inicio: a.inicio,
      faturamentoAntes: [...a.faturamentoAntes].sort((x, y) => x.mes.localeCompare(y.mes)),
    });
  }

  async renomearRestaurante(nome: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.restaurante = nome;
    } else {
      await this.call((h) => this.client.restaurantClient.updateMe({ name: nome }, h));
    }
    this.restaurante.set(nome);
    // O menu da conta mostra o nome do restaurante: já passa a mostrar o novo.
    this.auth.setCompanyName(nome);
  }

  /**
   * Lista os funcionários e traz a foto de cada um (cada funcionário é um usuário com foto própria). Ao abrir
   * o modal (`reaproveitarFotos` falso) as fotos são buscadas de novo; depois de adicionar/alterar alguém só
   * busca a de quem ainda não tinha sido vista.
   */
  async carregarMembros(reaproveitarFotos = false): Promise<void> {
    if (environment.useMocks) {
      this.membros.set([...mock.membros]);
      return;
    }
    if (!reaproveitarFotos) this.fotos.clear();
    const res = await this.call((h) => this.client.restaurantClient.listMembers(h));
    const lista = (res.payload ?? []).map(toMembro);
    // A lista aparece já (com iniciais) e as fotos entram assim que chegam.
    this.membros.set(lista.map((m) => this.comFoto(m)));
    await Promise.all(
      lista
        .filter((m) => !this.fotos.has(m.email))
        .map(async (m) => {
          this.fotos.set(m.email, await this.buscarFoto(m.email));
        }),
    );
    this.membros.set(lista.map((m) => this.comFoto(m)));
  }

  /** E-mail -> foto (`null` = sem foto ou não deu para buscar). */
  private fotos = new Map<string, string | null>();

  private comFoto(m: Membro): Membro {
    const foto = this.fotos.get(m.email);
    return foto ? { ...m, foto } : m;
  }

  private async buscarFoto(email: string): Promise<string | null> {
    try {
      const res = await this.call((h) => this.client.personClient.getAvatarByUsername(email, h));
      return res.payload?.avatar ?? null;
    } catch {
      return null; // sem foto não é motivo para travar a lista
    }
  }

  /** Convida o funcionário (E.1): ele recebe o link por e-mail e cria a própria senha. */
  async adicionarMembro(m: { nome: string; email: string; perfil: PerfilMembro }): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.membros = [
        ...mock.membros,
        {
          id: `m-${Date.now()}`,
          nome: m.nome,
          email: m.email,
          status: 'invited',
          perfil: m.perfil,
          conviteVenceEm: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      ];
    } else {
      await this.call((h) =>
        this.client.restaurantClient.createMember(
          { name: m.nome, email: m.email, profile: PERFIL_TO_LIB[m.perfil] },
          h,
        ),
      );
    }
    await this.carregarMembros(true);
  }

  /** Ativa/inativa, muda nome, e-mail ou perfil (E.2, E.3). */
  async atualizarMembro(
    id: string,
    mudancas: {
      status?: 'active' | 'inactive';
      nome?: string;
      email?: string;
      perfil?: PerfilMembro;
    },
  ): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.membros = mock.membros.map((x) =>
        x.id === id
          ? {
              ...x,
              ...(mudancas.status ? { status: mudancas.status } : {}),
              ...(mudancas.nome ? { nome: mudancas.nome } : {}),
              ...(mudancas.email ? { email: mudancas.email } : {}),
              ...(mudancas.perfil ? { perfil: mudancas.perfil } : {}),
            }
          : x,
      );
    } else {
      await this.call((h) =>
        this.client.restaurantClient.updateMember(
          id,
          {
            ...(mudancas.status ? { status: STATUS_TO_LIB[mudancas.status] } : {}),
            ...(mudancas.nome !== undefined ? { name: mudancas.nome } : {}),
            ...(mudancas.email !== undefined ? { email: mudancas.email } : {}),
            ...(mudancas.perfil ? { profile: PERFIL_TO_LIB[mudancas.perfil] } : {}),
          },
          h,
        ),
      );
    }
    await this.carregarMembros(true);
  }

  /** Manda um link novo (o anterior deixa de valer). Só para convite pendente. */
  async reenviarConvite(id: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
    } else {
      await this.call((h) => this.client.restaurantClient.resendInvite(id, h));
    }
    await this.carregarMembros(true);
  }

  /** Exclui o funcionário (E.2): perde o acesso, sai da lista e libera a vaga e o e-mail. */
  async excluirMembro(id: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.membros = mock.membros.filter((x) => x.id !== id);
    } else {
      await this.call((h) => this.client.restaurantClient.deleteMember(id, h));
    }
    await this.carregarMembros(true);
  }

  async pedirExclusao(senha: string, motivo?: string): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.exclusaoEm = new Date().toISOString();
      this.exclusaoPedidaEm.set(mock.exclusaoEm);
      return;
    }
    const res = await this.call((h) =>
      this.client.restaurantClient.requestDeletion(
        { password: senha, ...(motivo?.trim() ? { reason: motivo.trim() } : {}) },
        h,
      ),
    );
    const quando = res.payload?.deletionRequestedAt;
    this.exclusaoPedidaEm.set(quando ? new Date(quando).toISOString() : new Date().toISOString());
  }

  async cancelarExclusao(): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.exclusaoEm = null;
    } else {
      await this.call((h) => this.client.restaurantClient.cancelDeletion(h));
    }
    this.exclusaoPedidaEm.set(null);
  }
}
