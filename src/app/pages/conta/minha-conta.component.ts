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
import {
  MEMBER_INVITE_EXPIRY_DAYS,
  SUBSCRIPTION_MEMBER_LIMIT,
  SUBSCRIPTION_TIER_LABEL,
  REVENUE_BEFORE_MINTLY_MAX,
  TEAM_MAX_MEMBERS,
  TEAM_MAX_WEEKLY_HOURS,
  memberLimitForTier,
} from 'mintly-lib';
import { IconComponent } from '../../shared/icon.component';
import { ContaService, Membro, PerfilMembro } from '../../services/conta.service';
import { AVATAR_ACCEPT, readAvatarFile } from '../../shared/avatar-file';
import { ChipComponent } from '../../shared/chip.component';
import { ToggleComponent } from '../../shared/toggle.component';
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
  | 'equipe'
  | 'abertura'
  | 'membro'
  | 'exclusao'
  | 'carregar';

/**
 * Modal "Minha conta" (menu do usuário). "Meus dados": nome, telefone, e-mail e senha. "Restaurante" (só o
 * dono): nome, funcionários (logins próprios) e pedido de exclusão. A API é quem confere se quem pede é o dono.
 */
import { formatMoneyInput, moneyToInput } from '../../shared/money-input';
import { localISOMonth } from '../../shared/format';

@Component({
  selector: 'app-minha-conta',
  standalone: true,
  imports: [ModalComponent, ChipComponent, ToggleComponent, IconComponent],
  templateUrl: './minha-conta.component.html',
})
export class MinhaContaComponent {
  private svc = inject(ContaService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  protected readonly inputClass = INPUT;
  protected readonly Math = Math;
  /** "82,5" */
  protected fmtHoras(n: number): string {
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }
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
  /** T2: abertura da empresa e faturamento antes do Mintly (valores como texto do campo de dinheiro). */
  protected readonly REVENUE_BEFORE_MINTLY_MAX = REVENUE_BEFORE_MINTLY_MAX;
  protected readonly mesAtual = localISOMonth();
  protected aberturaInicio = signal('');
  protected aberturaLinhas = signal<{ mes: string; valor: string }[]>([]);
  protected aberturaLista = computed(() =>
    this.aberturaLinhas().map((l) => {
      const valor = Number(l.valor.replace(/\./g, '').replace(',', '.'));
      const mesOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(l.mes) && l.mes <= this.mesAtual;
      const valorOk = l.valor.trim() !== '' && Number.isFinite(valor) && valor >= 0;
      return { ...l, valorNum: valor, mesOk, valorOk };
    }),
  );
  protected aberturaValida = computed(() => {
    const ls = this.aberturaLista();
    const meses = ls.map((l) => l.mes);
    const inicio = this.aberturaInicio();
    return (
      (inicio === '' || inicio <= this.mesAtual) &&
      ls.every((l) => l.mesOk && l.valorOk) &&
      new Set(meses).size === meses.length
    );
  });
  protected aberturaMudou = computed(() => {
    const s = this.svc.abertura();
    const ls = this.aberturaLista();
    return (
      this.aberturaInicio() !== s.inicio ||
      ls.length !== s.faturamentoAntes.length ||
      ls.some(
        (l, i) =>
          l.mes !== s.faturamentoAntes[i]?.mes || l.valorNum !== s.faturamentoAntes[i]?.valor,
      )
    );
  });
  /** P.4: equipe em edição (horas como texto para o campo aceitar "22,5"). */
  protected equipeEdit = signal<{ nome: string; horas: string }[]>([]);
  protected readonly TEAM_MAX_MEMBERS = TEAM_MAX_MEMBERS;
  protected readonly TEAM_MAX_WEEKLY_HOURS = TEAM_MAX_WEEKLY_HOURS;
  protected equipeLinhas = computed(() =>
    this.equipeEdit().map((p) => {
      const horas = Number(p.horas.replace(',', '.'));
      const nomeOk = p.nome.trim().length > 0;
      const horasOk = Number.isFinite(horas) && horas >= 1 && horas <= TEAM_MAX_WEEKLY_HOURS;
      return { ...p, horasNum: horas, ok: nomeOk && horasOk, nomeOk, horasOk };
    }),
  );
  protected equipeTotalSemana = computed(() =>
    this.equipeLinhas().reduce((s, p) => s + (p.horasOk ? p.horasNum : 0), 0),
  );
  protected equipeValida = computed(() => this.equipeLinhas().every((p) => p.ok));
  protected equipeMudou = computed(() => {
    const salvo = this.svc.equipe() ?? [];
    const atual = this.equipeLinhas();
    return (
      atual.length !== salvo.length ||
      atual.some((p, i) => p.nome.trim() !== salvo[i].nome || p.horasNum !== salvo[i].horasSemana)
    );
  });
  protected novoMembro = signal<{ nome: string; email: string; perfil: PerfilMembro }>({
    nome: '',
    email: '',
    perfil: 'operations',
  });
  /** Funcionário com a edição (nome, e-mail, perfil) aberta. */
  protected membroEditId = signal<string | null>(null);
  protected edicao = signal<{ nome: string; email: string; perfil: PerfilMembro }>({
    nome: '',
    email: '',
    perfil: 'operations',
  });
  /** Funcionário com a confirmação de exclusão aberta. */
  protected membroExcluirId = signal<string | null>(null);
  protected readonly perfis: { valor: PerfilMembro; nome: string; desc: string }[] = [
    {
      valor: 'operations',
      nome: 'Operação',
      desc: 'Lança e vê movimentações (sem salários e pró-labore), consulta cardápio e contas. Não vê relatórios.',
    },
    {
      valor: 'manager',
      nome: 'Gerente',
      desc: 'Vê e faz tudo, menos assinatura, funcionários e exclusão do restaurante.',
    },
  ];
  protected readonly diasConvite = MEMBER_INVITE_EXPIRY_DAYS;
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
    return m.nome.trim().length >= 2 && EMAIL.test(m.email.trim());
  });
  protected edicaoValida = computed(() => {
    const e = this.edicao();
    return e.nome.trim().length >= 2 && EMAIL.test(e.email.trim());
  });
  // Vagas do plano: contam os ATIVOS e os convites pendentes (inativar libera a vaga; reativar ocupa uma).
  protected plano = computed(() => this.auth.subscriptionState().tier ?? 'basic');
  protected nomePlano = computed(() => SUBSCRIPTION_TIER_LABEL[this.plano()]);
  protected limiteFuncionarios = computed(() => memberLimitForTier(this.plano()));
  protected ativos = computed(() => this.membros().filter((m) => m.status !== 'inactive').length);
  protected limiteDeFuncionarios = computed(() => this.ativos() >= this.limiteFuncionarios());
  protected limitePro = SUBSCRIPTION_MEMBER_LIMIT.pro;

  protected valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setMembro(campo: 'nome' | 'email' | 'perfil', valor: string): void {
    this.novoMembro.update((m) => ({ ...m, [campo]: valor }));
  }

  protected setEdicao(campo: 'nome' | 'email' | 'perfil', valor: string): void {
    this.edicao.update((e) => ({ ...e, [campo]: valor }));
  }

  protected nomePerfil(p: PerfilMembro): string {
    return p === 'operations' ? 'Operação' : 'Gerente';
  }

  protected rotuloStatus(m: Membro): string {
    return m.status === 'active' ? 'Ativo' : m.status === 'invited' ? 'Convite enviado' : 'Inativo';
  }

  protected tomStatus(m: Membro): 'success' | 'warning' | 'neutral' {
    return m.status === 'active' ? 'success' : m.status === 'invited' ? 'warning' : 'neutral';
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
    this.membroEditId.set(null);
    this.membroExcluirId.set(null);
    for (const s of [
      this.novoEmail,
      this.senhaEmail,
      this.senhaAtual,
      this.senhaNova,
      this.senhaConfirma,
    ])
      s.set('');
    for (const s of [this.exclusaoSenha, this.exclusaoMotivo]) s.set('');
    this.novoMembro.set({ nome: '', email: '', perfil: 'operations' });

    this.ocupado.set('carregar');
    try {
      await this.svc.carregarConta();
      const d = this.dados();
      this.nome.set(d?.nome ?? '');
      this.telefone.set(d?.telefone ?? '');
      if (this.ehDono()) {
        await Promise.all([this.svc.carregarRestaurante(), this.svc.carregarMembros()]);
        this.nomeRest.set(this.restaurante());
        this.resetEquipe();
        this.resetAbertura();
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

  private resetAbertura(): void {
    const a = this.svc.abertura();
    this.aberturaInicio.set(a.inicio);
    this.aberturaLinhas.set(
      a.faturamentoAntes.map((x) => ({ mes: x.mes, valor: moneyToInput(x.valor) })),
    );
  }

  addMesAntes(): void {
    const ls = this.aberturaLinhas();
    if (ls.length >= REVENUE_BEFORE_MINTLY_MAX) return;
    // Sugere o mês antes do mais antigo já na lista (ou o mês passado).
    const base = ls.length ? [...ls].map((l) => l.mes).sort()[0] : this.mesAtual;
    const [y, m] = base.split('-').map(Number);
    const ant = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    this.aberturaLinhas.update((l) => [...l, { mes: ant, valor: '' }]);
  }

  removerMesAntes(i: number): void {
    this.aberturaLinhas.update((l) => l.filter((_, k) => k !== i));
  }

  setMesAntes(i: number, campo: 'mes' | 'valor', v: string): void {
    const valor = campo === 'valor' ? formatMoneyInput(v) : v;
    this.aberturaLinhas.update((l) => l.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));
  }

  async salvarAbertura(): Promise<void> {
    if (!this.aberturaValida() || !this.aberturaMudou()) return;
    this.ocupado.set('abertura');
    this.limpar('abertura');
    try {
      await this.svc.salvarAbertura({
        inicio: this.aberturaInicio(),
        faturamentoAntes: this.aberturaLista().map((l) => ({
          mes: l.mes,
          valor: Math.round(l.valorNum * 100) / 100,
        })),
      });
      this.resetAbertura();
      this.toast.success('Abertura e faturamento anterior salvos.');
    } catch (err) {
      this.falha('abertura', err, 'Não foi possível salvar a abertura da empresa.');
    } finally {
      this.ocupado.set(null);
    }
  }

  private resetEquipe(): void {
    this.equipeEdit.set(
      (this.svc.equipe() ?? []).map((p) => ({
        nome: p.nome,
        horas: String(p.horasSemana).replace('.', ','),
      })),
    );
  }

  addPessoa(): void {
    if (this.equipeEdit().length >= TEAM_MAX_MEMBERS) return;
    this.equipeEdit.update((l) => [...l, { nome: '', horas: '44' }]);
  }

  removerPessoa(i: number): void {
    this.equipeEdit.update((l) => l.filter((_, k) => k !== i));
  }

  setPessoa(i: number, campo: 'nome' | 'horas', valor: string): void {
    this.equipeEdit.update((l) => l.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));
  }

  async salvarEquipe(): Promise<void> {
    if (!this.equipeValida() || !this.equipeMudou()) return;
    this.ocupado.set('equipe');
    this.limpar('equipe');
    try {
      await this.svc.salvarEquipe(
        this.equipeLinhas().map((p) => ({
          nome: p.nome,
          horasSemana: Math.round(p.horasNum * 10) / 10,
        })),
      );
      this.resetEquipe();
      this.toast.success('Equipe salva.');
    } catch (err) {
      this.falha('equipe', err, 'Não foi possível salvar a equipe.');
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
        perfil: m.perfil,
      });
      this.toast.success(
        `Convite enviado para ${m.email.trim()}. O link para criar a senha vale ${MEMBER_INVITE_EXPIRY_DAYS} dias.`,
      );
      this.novoMembro.set({ nome: '', email: '', perfil: 'operations' });
    } catch (err) {
      this.falha('membro', err, 'Não foi possível adicionar o funcionário.');
    } finally {
      this.ocupado.set(null);
    }
  }

  /** "Desfazer" do aviso de inativação. */
  private async reativarMembro(m: Membro): Promise<void> {
    try {
      await this.svc.atualizarMembro(m.id, { status: 'active' });
      this.toast.success(`${m.nome} voltou a ter acesso.`);
    } catch (err) {
      this.falha('membro', err, 'Não foi possível reativar o funcionário.');
    }
  }

  async alternarMembro(m: Membro): Promise<void> {
    this.ocupado.set('membro');
    this.limpar('membro');
    try {
      await this.svc.atualizarMembro(m.id, {
        status: m.status !== 'inactive' ? 'inactive' : 'active',
      });
      if (m.status !== 'inactive') {
        this.toast.successWithAction(`${m.nome} foi inativado e perdeu o acesso.`, {
          label: 'Desfazer',
          run: () => this.reativarMembro(m),
        });
      } else {
        this.toast.success(`${m.nome} voltou a ter acesso.`);
      }
    } catch (err) {
      this.falha('membro', err, 'Não foi possível atualizar o funcionário.');
    } finally {
      this.ocupado.set(null);
    }
  }

  /** Abre (ou fecha) a edição de nome, e-mail e perfil. */
  abrirEdicao(m: Membro): void {
    this.membroExcluirId.set(null);
    if (this.membroEditId() === m.id) {
      this.membroEditId.set(null);
      return;
    }
    this.edicao.set({ nome: m.nome, email: m.email, perfil: m.perfil });
    this.membroEditId.set(m.id);
  }

  async salvarEdicao(m: Membro): Promise<void> {
    if (!this.edicaoValida()) return;
    const e = this.edicao();
    const nome = e.nome.trim();
    const email = e.email.trim().toLowerCase();
    const mudancas = {
      ...(nome !== m.nome ? { nome } : {}),
      ...(email !== m.email ? { email } : {}),
      ...(e.perfil !== m.perfil ? { perfil: e.perfil } : {}),
    };
    if (Object.keys(mudancas).length === 0) {
      this.membroEditId.set(null);
      return;
    }
    this.ocupado.set('membro');
    this.limpar('membro');
    try {
      await this.svc.atualizarMembro(m.id, mudancas);
      this.toast.success(
        mudancas.email && m.status === 'invited'
          ? `Dados de ${nome} salvos. O convite foi para ${email}.`
          : mudancas.email
            ? `Dados de ${nome} salvos. Ele entra de novo com o e-mail novo.`
            : `Dados de ${nome} salvos.`,
      );
      this.membroEditId.set(null);
    } catch (err) {
      this.falha('membro', err, 'Não foi possível salvar o funcionário.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async reenviarConvite(m: Membro): Promise<void> {
    this.ocupado.set('membro');
    this.limpar('membro');
    try {
      await this.svc.reenviarConvite(m.id);
      this.toast.success(`Convite reenviado para ${m.email}. O link anterior não vale mais.`);
    } catch (err) {
      this.falha('membro', err, 'Não foi possível reenviar o convite.');
    } finally {
      this.ocupado.set(null);
    }
  }

  pedirExclusaoMembro(m: Membro): void {
    this.membroEditId.set(null);
    this.membroExcluirId.set(this.membroExcluirId() === m.id ? null : m.id);
  }

  async excluirMembro(m: Membro): Promise<void> {
    this.ocupado.set('membro');
    this.limpar('membro');
    try {
      await this.svc.excluirMembro(m.id);
      this.toast.success(`${m.nome} foi excluído e perdeu o acesso.`);
      this.membroExcluirId.set(null);
    } catch (err) {
      this.falha('membro', err, 'Não foi possível excluir o funcionário.');
    } finally {
      this.ocupado.set(null);
    }
  }

  protected venceEm(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
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
