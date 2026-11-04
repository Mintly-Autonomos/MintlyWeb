import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { SUBSCRIPTION_MEMBER_LIMIT, SUBSCRIPTION_TIER_LABEL, memberLimitForTier } from 'mintly-lib';
import { ContaService, Membro } from '../../services/conta.service';
import { AVATAR_ACCEPT, readAvatarFile } from '../../shared/avatar-file';
import { ChipComponent } from '../../shared/chip.component';
import { ModalComponent } from '../../shared/modal.component';
import { ToastService } from '../../shared/toast.service';
import { apiErrorInfo } from '../../shared/api-error';
import { apiErrorMessage, isNoResponseError } from '../../shared/api-error-message';

const INPUT =
  'h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint';

/** Mesma política de senha da API: 8+ caracteres, maiúscula, minúscula e número. */
export function senhaForte(s: string): boolean {
  return s.length >= 8 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Iniciais para o círculo sem foto: primeira letra do primeiro e do último nome. */
function iniciaisDe(nome: string): string {
  const partes = nome.split(/\s+/).filter(Boolean);
  const i = (partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '');
  return i.toUpperCase() || '?';
}

type Secao =
  | 'dados'
  | 'foto'
  | 'email'
  | 'senha'
  | 'restaurante'
  | 'membro'
  | 'exclusao'
  | 'carregar';

/**
 * Modal "Minha conta" (menu do usuário). "Meus dados": nome, telefone, e-mail e senha. "Restaurante" (só o
 * dono): nome, funcionários (logins próprios) e pedido de exclusão. A API é quem confere se quem pede é o dono.
 */
@Component({
  selector: 'app-minha-conta',
  standalone: true,
  imports: [ModalComponent, ChipComponent],
  templateUrl: './minha-conta.component.html',
})
export class MinhaContaComponent {
  private svc = inject(ContaService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  protected readonly inputClass = INPUT;
  protected readonly avatarAccept = AVATAR_ACCEPT;
  private fotoInput = viewChild<ElementRef<HTMLInputElement>>('fotoInput');

  /** Foto de perfil atual (a mesma do menu da conta; a troca reflete lá na hora). */
  protected foto = computed(() => this.auth.currentUser()?.avatarDataUrl ?? null);
  protected iniciais = computed(() => iniciaisDe(this.dados()?.nome ?? ''));
  protected readonly iniciaisDe = iniciaisDe;

  protected aberto = signal(false);
  @Input() set open(v: boolean) {
    this.aberto.set(v);
    if (v) void this.abrir();
  }
  @Output() closed = new EventEmitter<void>();

  protected dados = this.svc.dados;
  protected restaurante = this.svc.restaurante;
  protected membros = this.svc.membros;
  protected exclusaoEm = this.svc.exclusaoPedidaEm;

  protected ehDono = computed(() => this.dados()?.papel === 'owner');
  protected aba = signal<'dados' | 'restaurante'>('dados');
  protected ocupado = signal<Secao | null>(null);
  /** Erro de cada parte (ex.: "Senha incorreta."), mostrado junto do botão que falhou. */
  protected erros = signal<Partial<Record<Secao, string>>>({});

  // Meus dados
  protected nome = signal('');
  protected telefone = signal('');
  protected emailAberto = signal(false);
  protected novoEmail = signal('');
  protected senhaEmail = signal('');
  protected senhaAberta = signal(false);
  protected senhaAtual = signal('');
  protected senhaNova = signal('');
  protected senhaConfirma = signal('');

  // Restaurante
  protected nomeRest = signal('');
  protected novoMembro = signal({ nome: '', email: '', senha: '' });
  protected membroSenhaId = signal<string | null>(null);
  protected membroNovaSenha = signal('');
  protected exclusaoAberta = signal(false);
  protected exclusaoSenha = signal('');
  protected exclusaoMotivo = signal('');

  // ── o que dá para salvar ──
  protected dadosMudaram = computed(() => {
    const d = this.dados();
    return !!d && (this.nome().trim() !== d.nome || this.telefone().trim() !== d.telefone);
  });
  protected dadosValidos = computed(
    () =>
      this.nome().trim().length >= 2 &&
      (this.telefone().trim() === '' || this.telefone().trim().length >= 8),
  );
  protected emailValido = computed(() => EMAIL.test(this.novoEmail().trim()));
  protected senhaNovaForte = computed(() => senhaForte(this.senhaNova()));
  protected senhasConferem = computed(
    () => this.senhaNova() !== '' && this.senhaNova() === this.senhaConfirma(),
  );
  protected restauranteMudou = computed(
    () => this.nomeRest().trim() !== this.restaurante() && this.nomeRest().trim().length >= 2,
  );
  protected membroValido = computed(() => {
    const m = this.novoMembro();
    return m.nome.trim().length >= 2 && EMAIL.test(m.email.trim()) && senhaForte(m.senha);
  });
  // Vagas do plano: contam só os funcionários ATIVOS (inativar libera a vaga; reativar ocupa uma).
  protected plano = computed(() => this.auth.subscriptionState().tier ?? 'basic');
  protected nomePlano = computed(() => SUBSCRIPTION_TIER_LABEL[this.plano()]);
  protected limiteFuncionarios = computed(() => memberLimitForTier(this.plano()));
  protected ativos = computed(() => this.membros().filter((m) => m.status === 'active').length);
  protected limiteDeFuncionarios = computed(() => this.ativos() >= this.limiteFuncionarios());
  protected limitePro = SUBSCRIPTION_MEMBER_LIMIT.pro;

  protected valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setMembro(campo: 'nome' | 'email' | 'senha', valor: string): void {
    this.novoMembro.update((m) => ({ ...m, [campo]: valor }));
  }

  protected dataPedido(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  private falha(secao: Secao, err: unknown, padrao: string): void {
    // Erro nosso (ex.: foto grande demais, formato inválido) traz a própria mensagem; o da API segue o padrão.
    const nosso =
      err instanceof Error && !isNoResponseError(err) && apiErrorInfo(err).status === undefined;
    this.erros.update((e) => ({
      ...e,
      [secao]: nosso ? err.message : apiErrorMessage(err, padrao),
    }));
  }

  private limpar(secao: Secao): void {
    this.erros.update((e) => ({ ...e, [secao]: undefined }));
  }

  /** Abre o modal com tudo limpo e carrega os dados. */
  private async abrir(): Promise<void> {
    this.aba.set('dados');
    this.erros.set({});
    this.emailAberto.set(false);
    this.senhaAberta.set(false);
    this.exclusaoAberta.set(false);
    this.membroSenhaId.set(null);
    for (const s of [
      this.novoEmail,
      this.senhaEmail,
      this.senhaAtual,
      this.senhaNova,
      this.senhaConfirma,
    ])
      s.set('');
    for (const s of [this.membroNovaSenha, this.exclusaoSenha, this.exclusaoMotivo]) s.set('');
    this.novoMembro.set({ nome: '', email: '', senha: '' });

    this.ocupado.set('carregar');
    try {
      await this.svc.carregarConta();
      const d = this.dados();
      this.nome.set(d?.nome ?? '');
      this.telefone.set(d?.telefone ?? '');
      if (this.ehDono()) {
        await Promise.all([this.svc.carregarRestaurante(), this.svc.carregarMembros()]);
        this.nomeRest.set(this.restaurante());
      }
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'Não foi possível carregar sua conta.'));
    } finally {
      this.ocupado.set(null);
    }
  }

  escolherFoto(): void {
    this.fotoInput()?.nativeElement.click();
  }

  async trocarFoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    this.ocupado.set('foto');
    this.limpar('foto');
    try {
      await this.auth.updateAvatar(await readAvatarFile(arquivo));
      this.toast.success('Foto de perfil atualizada.');
    } catch (err) {
      this.falha('foto', err, 'Não foi possível atualizar a foto.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async removerFoto(): Promise<void> {
    this.ocupado.set('foto');
    this.limpar('foto');
    try {
      await this.auth.removeAvatar();
      this.toast.success('Foto removida.');
    } catch (err) {
      this.falha('foto', err, 'Não foi possível remover a foto.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async salvarDados(): Promise<void> {
    if (!this.dadosMudaram() || !this.dadosValidos()) return;
    const d = this.dados()!;
    this.ocupado.set('dados');
    this.limpar('dados');
    try {
      await this.svc.salvarDados({
        ...(this.nome().trim() !== d.nome ? { nome: this.nome().trim() } : {}),
        ...(this.telefone().trim() !== d.telefone && this.telefone().trim() !== ''
          ? { telefone: this.telefone().trim() }
          : {}),
      });
      this.toast.success('Seus dados foram atualizados.');
    } catch (err) {
      this.falha('dados', err, 'Não foi possível salvar seus dados.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async trocarEmail(): Promise<void> {
    if (!this.emailValido() || this.senhaEmail() === '') return;
    this.ocupado.set('email');
    this.limpar('email');
    try {
      await this.svc.trocarEmail(this.novoEmail().trim(), this.senhaEmail());
      this.toast.success('E-mail atualizado. É com ele que você entra agora.');
      this.emailAberto.set(false);
      this.novoEmail.set('');
      this.senhaEmail.set('');
    } catch (err) {
      this.falha('email', err, 'Não foi possível trocar o e-mail.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async trocarSenha(): Promise<void> {
    if (this.senhaAtual() === '' || !this.senhaNovaForte() || !this.senhasConferem()) return;
    this.ocupado.set('senha');
    this.limpar('senha');
    try {
      await this.svc.trocarSenha(this.senhaAtual(), this.senhaNova());
      // A API encerra as sessões: o serviço já levou a pessoa ao login.
      this.toast.success('Senha alterada. Entre de novo com a senha nova.');
      this.closed.emit();
    } catch (err) {
      this.falha('senha', err, 'Não foi possível trocar a senha.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async salvarRestaurante(): Promise<void> {
    if (!this.restauranteMudou()) return;
    this.ocupado.set('restaurante');
    this.limpar('restaurante');
    try {
      await this.svc.renomearRestaurante(this.nomeRest().trim());
      this.toast.success('Nome do restaurante atualizado.');
    } catch (err) {
      this.falha('restaurante', err, 'Não foi possível salvar o nome do restaurante.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async adicionarMembro(): Promise<void> {
    if (!this.membroValido() || this.limiteDeFuncionarios()) return;
    const m = this.novoMembro();
    this.ocupado.set('membro');
    this.limpar('membro');
    try {
      await this.svc.adicionarMembro({
        nome: m.nome.trim(),
        email: m.email.trim(),
        senha: m.senha,
      });
      this.toast.success('Funcionário adicionado. Ele já pode entrar com esse e-mail e senha.');
      this.novoMembro.set({ nome: '', email: '', senha: '' });
    } catch (err) {
      this.falha('membro', err, 'Não foi possível adicionar o funcionário.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async alternarMembro(m: Membro): Promise<void> {
    this.ocupado.set('membro');
    this.limpar('membro');
    try {
      await this.svc.atualizarMembro(m.id, {
        status: m.status === 'active' ? 'inactive' : 'active',
      });
      this.toast.success(
        m.status === 'active' ? `${m.nome} foi inativado.` : `${m.nome} voltou a ter acesso.`,
      );
    } catch (err) {
      this.falha('membro', err, 'Não foi possível atualizar o funcionário.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async definirSenhaMembro(m: Membro): Promise<void> {
    if (!senhaForte(this.membroNovaSenha())) return;
    this.ocupado.set('membro');
    this.limpar('membro');
    try {
      await this.svc.atualizarMembro(m.id, { senha: this.membroNovaSenha() });
      this.toast.success(`Senha de ${m.nome} atualizada. Ele precisa entrar de novo.`);
      this.membroSenhaId.set(null);
      this.membroNovaSenha.set('');
    } catch (err) {
      this.falha('membro', err, 'Não foi possível trocar a senha do funcionário.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async pedirExclusao(): Promise<void> {
    if (this.exclusaoSenha() === '') return;
    this.ocupado.set('exclusao');
    this.limpar('exclusao');
    try {
      await this.svc.pedirExclusao(this.exclusaoSenha(), this.exclusaoMotivo());
      this.toast.success('Pedido de exclusão registrado. Nada foi apagado ainda.');
      this.exclusaoAberta.set(false);
      this.exclusaoSenha.set('');
      this.exclusaoMotivo.set('');
    } catch (err) {
      this.falha('exclusao', err, 'Não foi possível registrar o pedido.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async cancelarExclusao(): Promise<void> {
    this.ocupado.set('exclusao');
    this.limpar('exclusao');
    try {
      await this.svc.cancelarExclusao();
      this.toast.success('Pedido de exclusão cancelado.');
    } catch (err) {
      this.falha('exclusao', err, 'Não foi possível cancelar o pedido.');
    } finally {
      this.ocupado.set(null);
    }
  }
}
