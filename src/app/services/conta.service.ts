import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MemberStatus } from 'mintly-lib';
import type { Headers, MyAccount, RestaurantMember } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { apiErrorInfo } from '../shared/api-error';
import { AuthService } from './auth.service';
import { MintlyClientService } from './mintly-client.service';

export type MemberStatusKey = 'active' | 'inactive';

/** Funcionário como a tela usa (datas já como texto ISO). */
export interface Membro {
  id: string;
  nome: string;
  email: string;
  status: MemberStatusKey;
  /** Foto de perfil do funcionário (data URL); sem foto, a tela mostra as iniciais. */
  foto?: string;
}

export interface ContaDados {
  nome: string;
  email: string;
  telefone: string;
  /** `owner` (dono) ou `member` (funcionário): só o dono vê a parte do restaurante. */
  papel: 'owner' | 'member';
}

/**
 * Funcionários ATIVOS que cada plano permite (o dono não conta). É o mesmo valor da API (que é quem barra):
 * aqui serve só para mostrar "3 de 5" e esconder o formulário quando as vagas acabam.
 */
export const LIMITE_FUNCIONARIOS: Record<'basic' | 'pro', number> = { basic: 5, pro: 20 };

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Estado do modo demonstração (`useMocks`): vale só enquanto a aba está aberta. */
const mock = {
  telefone: '11999990000',
  restaurante: '',
  exclusaoEm: null as string | null,
  membros: [] as Membro[],
};

const toMembro = (m: RestaurantMember): Membro => ({
  id: m._id,
  nome: m.name,
  email: m.email,
  status: m.status === 'inactive' ? 'inactive' : 'active',
});

const toDados = (a: MyAccount): ContaDados => ({
  nome: a.name,
  email: a.email,
  telefone: a.phone ?? '',
  papel: a.role === 'member' ? 'member' : 'owner',
});

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
    if (res.payload) this.dados.set(toDados(res.payload));
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
      return;
    }
    const res = await this.call((h) => this.client.restaurantClient.me({}, h));
    const r = res.payload?.restaurant;
    if (r) {
      this.restaurante.set(r.name);
      const pedido = (r as { deletionRequestedAt?: Date | string }).deletionRequestedAt;
      this.exclusaoPedidaEm.set(pedido ? new Date(pedido).toISOString() : null);
    }
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

  async adicionarMembro(m: { nome: string; email: string; senha: string }): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.membros = [
        ...mock.membros,
        { id: `m-${Date.now()}`, nome: m.nome, email: m.email, status: 'active' },
      ];
    } else {
      await this.call((h) =>
        this.client.restaurantClient.createMember(
          { name: m.nome, email: m.email, password: m.senha },
          h,
        ),
      );
    }
    await this.carregarMembros(true);
  }

  async atualizarMembro(
    id: string,
    mudancas: { status?: MemberStatusKey; senha?: string },
  ): Promise<void> {
    if (environment.useMocks) {
      await delay();
      mock.membros = mock.membros.map((x) =>
        x.id === id && mudancas.status ? { ...x, status: mudancas.status } : x,
      );
    } else {
      await this.call((h) =>
        this.client.restaurantClient.updateMember(
          id,
          {
            ...(mudancas.status
              ? {
                  status:
                    mudancas.status === 'inactive' ? MemberStatus.Inactive : MemberStatus.Active,
                }
              : {}),
            ...(mudancas.senha ? { password: mudancas.senha } : {}),
          },
          h,
        ),
      );
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
