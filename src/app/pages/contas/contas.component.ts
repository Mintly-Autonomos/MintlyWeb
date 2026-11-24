import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ContasService,
  Account,
  AccType,
  TYPE_META,
  UpdateAccountInput,
} from '../../services/contas.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { ToggleComponent } from '../../shared/toggle.component';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FilterBarComponent, FilterSelectComponent } from '../../shared/filter-bar.component';
import { AuditTimelineComponent } from '../../shared/audit-timeline.component';
import { ToastService } from '../../shared/toast.service';
import { apiErrorMessage } from '../../shared/api-error-message';
import { formatBRL, fmtDateTime } from '../../shared/format';
import {
  describeSettlementRule,
  resolveSettlementRule,
  settlementDueDate,
  PlatformKind,
} from 'mintly-lib';
import type { FeeByMethod } from 'mintly-lib';
import {
  SETTLEMENT_KIND_OPTS,
  SettlementFormState,
  WEEKDAY_BUTTONS,
  emptySettlementForm,
  settlementFormError,
  settlementFormFromAccount,
  settlementRuleFromForm,
} from './settlement-form';
import { MoneyInputDirective } from '../../shared/money-input.directive';
import { localISODate } from '../../shared/format';
import { AuthService } from '../../services/auth.service';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Formas de pagamento com taxa própria numa plataforma (S3.3). */
const FEE_METHOD_OPTS = [
  { key: 'debit', label: 'Débito' },
  { key: 'credit', label: 'Crédito' },
  { key: 'pix', label: 'Pix' },
  { key: 'digitalWallet', label: 'Carteira digital' },
] as const satisfies readonly { key: keyof FeeByMethod; label: string }[];

type FeeForm = Record<keyof FeeByMethod, string>;

const emptyFeeForm = (): FeeForm => ({ debit: '', credit: '', pix: '', digitalWallet: '' });

/** "" → null (usa a padrão); "3,1" → 3.1; texto inválido → NaN. */
function parsePct(raw: string): number | null {
  const t = raw.trim();
  return t === '' ? null : Number(t.replace(',', '.'));
}

function feeFormFromAccount(fees: FeeByMethod | undefined): FeeForm {
  const f = emptyFeeForm();
  for (const m of FEE_METHOD_OPTS) if (fees?.[m.key] != null) f[m.key] = String(fees[m.key]);
  return f;
}

function feeByMethodFromForm(form: FeeForm): FeeByMethod {
  const out: FeeByMethod = {};
  for (const m of FEE_METHOD_OPTS) {
    const n = parsePct(form[m.key]);
    if (n !== null && Number.isFinite(n)) out[m.key] = n;
  }
  return out;
}

const fmtPct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

@Component({
  selector: 'app-contas',
  standalone: true,
  imports: [
    FormsModule,
    IconComponent,
    ChipComponent,
    ToggleComponent,
    ModalComponent,
    EmptyStateComponent,
    FilterBarComponent,
    FilterSelectComponent,
    AuditTimelineComponent,
    MoneyInputDirective,
  ],
  templateUrl: './contas.component.html',
})
export class ContasComponent implements OnInit {
  /** Perfil Operação (E.3) só consulta: a API recusa criar e editar. */
  protected podeEditar = inject(AuthService).podeMudarCadastros;
  private svc = inject(ContasService);
  private toast = inject(ToastService);

  // Transferência entre contas e saldo inicial (S3.2)
  protected transferOpen = signal(false);
  protected transferForm = signal({
    fromId: '',
    toId: '',
    valor: '',
    data: localISODate(),
    descricao: '',
  });
  protected transferSaving = signal(false);
  protected openingFor = signal<Account | null>(null);
  protected openingForm = signal({ valor: '', data: localISODate() });
  protected openingSaving = signal(false);
  protected readonly hoje = localISODate();

  // State
  protected editing = signal<Account | null>(null);
  protected creating = signal(false);
  protected blocked = signal<Account | null>(null);
  protected reassign = signal<Account | null>(null);
  protected confirmDefault = signal<{ next: Account; prev: Account | null } | null>(null);
  protected details = signal<Account | null>(null);
  protected query = signal('');
  protected typeFilter = signal<'all' | AccType>('all');
  protected statusFilter = signal<'all' | 'active' | 'inactive'>('all');

  // Reassign selection
  protected selectedReassignId = signal<string | null>(null);

  // Deferred apply for the "confirm default swap" modal
  private pendingApply: (() => Promise<void>) | null = null;

  // Form state for modal
  protected form = signal<{
    name: string;
    type: AccType;
    active: boolean;
    isDefault: boolean;
    taxPct: string;
    platformKind: PlatformKind;
    feeByMethod: FeeForm;
    settlement: SettlementFormState;
  }>({
    name: '',
    type: 'Bank',
    active: true,
    isDefault: false,
    taxPct: '',
    platformKind: PlatformKind.Marketplace,
    feeByMethod: emptyFeeForm(),
    settlement: emptySettlementForm(),
  });

  protected readonly PlatformKind = PlatformKind;
  protected readonly feeMethods = FEE_METHOD_OPTS;

  protected readonly settlementKinds = SETTLEMENT_KIND_OPTS;
  protected readonly weekdays = WEEKDAY_BUTTONS;

  // Computed
  protected accounts = this.svc.accounts;
  protected loading = this.svc.loading;

  protected activeCount = computed(() => this.accounts().filter((a) => a.active).length);
  protected total = computed(() =>
    this.accounts()
      .filter((a) => a.active)
      .reduce((s, a) => s + a.balance, 0),
  );
  /**
   * Reteste 18/11, item 5: o `predictedBalance` da API é só a soma das PENDÊNCIAS da conta. O saldo previsto é o
   * saldo atual mais elas (conta sem pendência repete o saldo atual, em vez de mostrar zero).
   */
  protected previsto = (a: { balance: number; predictedBalance: number }): number =>
    Math.round((a.balance + a.predictedBalance) * 100) / 100;
  protected totalPredicted = computed(() =>
    this.accounts()
      .filter((a) => a.active)
      .reduce((s, a) => s + this.previsto(a), 0),
  );
  /** Conta de banco, caixa ou carteira (não plataforma) com saldo negativo: dinheiro que não existe. */
  protected negativa = (a: { type: string; balance: number; active: boolean }): boolean =>
    a.active && a.type !== 'Financial Platform' && a.balance < 0;

  protected activeFilters = computed(
    () => (this.typeFilter() !== 'all' ? 1 : 0) + (this.statusFilter() !== 'all' ? 1 : 0),
  );

  protected sorted = computed(() => {
    const cmp = (a: Account, b: Account) => a.name.localeCompare(b.name, 'pt-BR');
    const q = this.query().trim().toLowerCase();
    const matches = this.accounts().filter((a) => {
      if (this.typeFilter() !== 'all' && a.type !== this.typeFilter()) return false;
      if (this.statusFilter() === 'active' && !a.active) return false;
      if (this.statusFilter() === 'inactive' && a.active) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return [
      ...matches.filter((a) => a.active).sort(cmp),
      ...matches.filter((a) => !a.active).sort(cmp),
    ];
  });

  // Helpers
  protected typeMeta = TYPE_META;
  protected accTypes = Object.keys(TYPE_META) as AccType[];
  protected fmtBRL = formatBRL;
  protected fmtDate = fmtDateTime;

  protected typeOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'Bank', label: 'Banco' },
    { value: 'Cash Register', label: 'Caixa' },
    { value: 'Digital Wallet', label: 'Carteira digital' },
    { value: 'Financial Platform', label: 'Plataforma financeira' },
  ];
  protected statusOpts = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Ativas' },
    { value: 'inactive', label: 'Inativas' },
  ];

  ngOnInit(): void {
    this.svc.refresh().catch((err) => this.toast.error(this.errMsg(err)));
  }

  clearFilters(): void {
    this.typeFilter.set('all');
    this.statusFilter.set('all');
  }

  /** "1.234,56" (campo de dinheiro) → 1234.56; vazio → 0. */
  protected moneyNumber(texto: string): number {
    const n = Number(texto.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  protected inputText(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected contasAtivas = computed(() => this.accounts().filter((a) => a.active));

  openTransfer(): void {
    const ativas = this.contasAtivas();
    // Origem sugerida: a plataforma com mais saldo (é de onde o repasse costuma sair); destino: a padrão.
    const origem =
      [...ativas]
        .filter((a) => a.type === 'Financial Platform')
        .sort((a, b) => b.balance - a.balance)[0] ??
      ativas.find((a) => !a.isDefault) ??
      ativas[0];
    const destino =
      ativas.find((a) => a.isDefault && a.id !== origem?.id) ??
      ativas.find((a) => a.id !== origem?.id);
    this.transferForm.set({
      fromId: origem?.id ?? '',
      toId: destino?.id ?? '',
      valor: '',
      data: localISODate(),
      descricao: '',
    });
    this.transferOpen.set(true);
  }

  setTransfer(campo: 'fromId' | 'toId' | 'valor' | 'data' | 'descricao', valor: string): void {
    this.transferForm.update((f) => ({ ...f, [campo]: valor }));
  }

  /** O que falta para transferir (null = pode). */
  protected transferProblema = computed(() => {
    const f = this.transferForm();
    if (!f.fromId || !f.toId) return 'Escolha as duas contas.';
    if (f.fromId === f.toId) return 'A origem e o destino precisam ser contas diferentes.';
    if (!(this.moneyNumber(f.valor) > 0)) return 'Informe o valor.';
    if (!f.data) return 'Informe a data.';
    if (f.data > this.hoje) return 'A data não pode estar no futuro.';
    return null;
  });

  async confirmTransfer(): Promise<void> {
    if (this.transferProblema() || this.transferSaving()) return;
    const f = this.transferForm();
    this.transferSaving.set(true);
    try {
      await this.svc.transfer({
        fromId: f.fromId,
        toId: f.toId,
        amount: this.moneyNumber(f.valor),
        date: f.data,
        description: f.descricao.trim() || undefined,
      });
      const nome = (id: string) => this.accounts().find((a) => a.id === id)?.name ?? '';
      this.toast.success(
        `Transferência de ${fmtTransfer(this.moneyNumber(f.valor))} de ${nome(f.fromId)} para ${nome(f.toId)} registrada.`,
      );
      this.transferOpen.set(false);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    } finally {
      this.transferSaving.set(false);
    }
  }

  openOpening(a: Account): void {
    this.openingForm.set({ valor: '', data: localISODate() });
    this.openingFor.set(a);
  }

  setOpening(campo: 'valor' | 'data', valor: string): void {
    this.openingForm.update((f) => ({ ...f, [campo]: valor }));
  }

  async confirmOpening(): Promise<void> {
    const a = this.openingFor();
    const f = this.openingForm();
    if (!a || !f.data || f.data > this.hoje || this.openingSaving()) return;
    this.openingSaving.set(true);
    try {
      const valor = this.moneyNumber(f.valor);
      await this.svc.setOpeningBalance(a.id, valor, f.data);
      this.toast.success(
        valor > 0 ? `Saldo inicial de ${a.name} definido.` : `Saldo inicial de ${a.name} removido.`,
      );
      this.openingFor.set(null);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    } finally {
      this.openingSaving.set(false);
    }
  }

  // Open create/edit modal
  openCreate(): void {
    this.form.set({
      name: '',
      type: 'Bank',
      active: true,
      isDefault: false,
      taxPct: '',
      platformKind: PlatformKind.Marketplace,
      feeByMethod: emptyFeeForm(),
      settlement: emptySettlementForm(),
    });
    this.creating.set(true);
  }

  openEdit(a: Account): void {
    this.form.set({
      name: a.name,
      type: a.type,
      active: a.active,
      isDefault: a.isDefault,
      taxPct: a.taxPct != null ? String(a.taxPct) : '',
      platformKind: a.platformKind ?? PlatformKind.Marketplace,
      feeByMethod: feeFormFromAccount(a.feeByMethod),
      settlement: settlementFormFromAccount(a),
    });
    this.editing.set(a);
  }

  closeModal(): void {
    this.creating.set(false);
    this.editing.set(null);
  }

  // Form computed helpers
  get isPlatform(): boolean {
    return this.form().type === 'Financial Platform';
  }

  get nameError(): string {
    const trimmed = this.form().name.trim();
    if (trimmed.length > 0 && trimmed.length < 3) return 'Use pelo menos 3 caracteres.';
    const editing = this.editing();
    if (trimmed.length >= 3) {
      const dup = this.accounts().some(
        (a) =>
          a.id !== editing?.id &&
          a.type === this.form().type &&
          normalize(a.name) === normalize(trimmed),
      );
      if (dup) return 'Já existe uma conta com esse nome e tipo. Use uma combinação diferente.';
    }
    return '';
  }

  get saveDisabled(): boolean {
    const f = this.form();
    const trimmed = f.name.trim();
    if (!trimmed || this.nameError) return true;
    const e = this.editing();
    if (e?.isDefault && !f.isDefault) return true;
    if (e && e.active && !f.active) {
      if (this.activeCount() <= 1 || e.balance !== 0 || e.predictedBalance !== 0 || e.isDefault)
        return true;
    }
    if (this.isPlatform && this.settlementError) return true;
    if (this.isPlatform && this.taxError) return true;
    if (this.isPlatform && this.feeByMethodError) return true;
    return false;
  }

  /** "26,2" (vírgula decimal, como no resto da tela); antes saía "26.2". */
  protected pctBR = (n: number): string => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  /** Taxa da plataforma: um percentual entre 0 e 100 (vazio = 0). */
  get taxError(): string {
    const raw = this.form().taxPct.trim();
    if (raw === '') return '';
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Informe uma taxa entre 0% e 100%.';
    return '';
  }

  /** Taxas por forma de pagamento: cada uma vazia (usa a padrão) ou entre 0 e 100. */
  get feeByMethodError(): string {
    const fora = FEE_METHOD_OPTS.find((m) => {
      const n = parsePct(this.form().feeByMethod[m.key]);
      return n !== null && (Number.isNaN(n) || n < 0 || n > 100);
    });
    return fora ? `Taxa do ${fora.label.toLowerCase()}: informe entre 0% e 100%.` : '';
  }

  setFormPlatformKind(kind: PlatformKind): void {
    this.form.update((f) => ({ ...f, platformKind: kind }));
  }
  setFormFeeByMethod(method: keyof FeeForm, v: string): void {
    this.form.update((f) => ({ ...f, feeByMethod: { ...f.feeByMethod, [method]: v } }));
  }

  /** "Maquininha" ou "App de delivery" (só plataforma). */
  platformLabel(a: Pick<Account, 'type' | 'platformKind'>): string {
    if (a.type !== 'Financial Platform') return '';
    return a.platformKind === PlatformKind.CardMachine ? 'Maquininha' : 'App de delivery';
  }

  /** "Débito 1% · Crédito 3,1%" (só as formas com taxa própria). */
  feeByMethodLabel(a: Pick<Account, 'feeByMethod'>): string {
    return FEE_METHOD_OPTS.filter((m) => a.feeByMethod?.[m.key] != null)
      .map((m) => `${m.label} ${fmtPct(a.feeByMethod![m.key]!)}%`)
      .join(' · ');
  }

  get deactivateReason(): string {
    const f = this.form();
    const e = this.editing();
    if (!e || !e.active || f.active) return '';
    if (this.activeCount() <= 1) return 'Esta é a única conta ativa do sistema.';
    if (e.balance !== 0 || e.predictedBalance !== 0)
      return 'Esta conta possui saldo disponível ou previsto diferente de zero.';
    if (e.isDefault)
      return 'Conta padrão não pode ser desativada. Defina outra conta como padrão antes.';
    return '';
  }

  setFormType(t: AccType): void {
    this.form.update((f) => ({ ...f, type: t }));
  }
  setFormName(n: string): void {
    this.form.update((f) => ({ ...f, name: n }));
  }
  setFormDefault(v: boolean): void {
    this.form.update((f) => ({ ...f, isDefault: v }));
  }
  setFormActive(v: boolean): void {
    this.form.update((f) => ({ ...f, active: v }));
  }
  setFormTaxPct(v: string): void {
    this.form.update((f) => ({ ...f, taxPct: v }));
  }
  setSettlementKind(kind: SettlementFormState['kind']): void {
    this.form.update((f) => ({ ...f, settlement: { ...f.settlement, kind } }));
  }
  setWeekday(weekday: number): void {
    this.form.update((f) => ({ ...f, settlement: { ...f.settlement, weekday } }));
  }
  setSettlementField(field: 'days' | 'firstDay' | 'secondDay' | 'monthDay', v: string): void {
    this.form.update((f) => ({ ...f, settlement: { ...f.settlement, [field]: v } }));
  }

  /** O que falta no bloco de repasse (vazio quando está pronto). */
  get settlementError(): string {
    return settlementFormError(this.form().settlement);
  }

  /** Exemplo para a pessoa conferir a regra: "Uma venda de hoje cai em 04/11/2026". */
  get settlementPreview(): string {
    const rule = settlementRuleFromForm(this.form().settlement);
    if (!rule) return '';
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const due = settlementDueDate(rule, today);
    return due
      ? `Uma venda de hoje cai em ${due.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`
      : 'O valor cai na hora, no mesmo dia da venda.';
  }

  /** A regra de repasse da conta em palavras ("Toda quarta-feira", "7 dias após a venda"). */
  repasseLabel(a: Pick<Account, 'settlementRule' | 'settlementDays'>): string {
    const rule = resolveSettlementRule(a);
    return rule ? describeSettlementRule(rule) : '—';
  }

  private errMsg(err: unknown): string {
    return apiErrorMessage(err);
  }

  async save(): Promise<void> {
    if (this.saveDisabled) return;
    const f = this.form();
    const e = this.editing();
    if (e) {
      const becomingDefault = !e.isDefault && f.isDefault;
      const currentDefault = this.accounts().find((a) => a.isDefault && a.id !== e.id) ?? null;
      const apply = async () => {
        try {
          await this.applyEdit(e, f);
          this.toast.success('Conta atualizada.');
          this.editing.set(null);
        } catch (err) {
          this.toast.error(this.errMsg(err));
        }
      };
      if (becomingDefault && currentDefault) {
        // Fecha o modal de edição antes de abrir a confirmação de troca — os dois
        // não devem ficar abertos ao mesmo tempo (mesmo padrão do fluxo de criação,
        // que já fecha "Nova conta" antes de mostrar "Trocar conta padrão?").
        this.editing.set(null);
        this.confirmDefault.set({
          next: { ...e, ...f } as unknown as Account,
          prev: currentDefault,
        });
        this.pendingApply = apply;
        return;
      }
      await apply();
    } else {
      try {
        const id = await this.svc.create({
          name: f.name.trim(),
          type: f.type,
          taxPct: this.isPlatform ? Number(f.taxPct) || 0 : undefined,
          platformKind: this.isPlatform ? f.platformKind : undefined,
          feeByMethod: this.isPlatform ? feeByMethodFromForm(f.feeByMethod) : undefined,
          settlementRule: this.isPlatform
            ? (settlementRuleFromForm(f.settlement) ?? undefined)
            : undefined,
        });
        this.toast.success('Conta criada com sucesso.');
        this.creating.set(false);
        // isDefault nunca vai no insert (índice único parcial); se o usuário marcou
        // "Conta padrão", promovemos a conta recém-criada num 2º passo, com a mesma
        // confirmação de troca usada na edição quando já existe uma padrão.
        if (f.isDefault) {
          await this.promoteToDefault(id, f.name.trim());
        }
      } catch (err) {
        this.toast.error(this.errMsg(err));
      }
    }
  }

  private async promoteToDefault(id: string, name: string): Promise<void> {
    const created = this.accounts().find((a) => a.id === id);
    const currentDefault = this.accounts().find((a) => a.isDefault && a.id !== id) ?? null;
    const promote = async () => {
      try {
        await this.svc.setDefault(id);
        this.toast.info(`${name} agora é a conta padrão.`);
      } catch (err) {
        this.toast.error(this.errMsg(err));
      }
    };
    if (currentDefault && created) {
      this.confirmDefault.set({ next: created, prev: currentDefault });
      this.pendingApply = promote;
      return;
    }
    await promote();
  }

  /** Aplica edições de campo, e então (se preciso) inativação/definição de padrão. */
  private async applyEdit(
    e: Account,
    f: {
      name: string;
      type: AccType;
      active: boolean;
      isDefault: boolean;
      taxPct: string;
      platformKind: PlatformKind;
      feeByMethod: FeeForm;
      settlement: SettlementFormState;
    },
  ): Promise<void> {
    const patch: UpdateAccountInput = {
      name: f.name.trim(),
      type: f.type,
      taxPct: this.isPlatform ? Number(f.taxPct) || 0 : undefined,
      platformKind: this.isPlatform ? f.platformKind : undefined,
      feeByMethod: this.isPlatform ? feeByMethodFromForm(f.feeByMethod) : undefined,
      settlementRule: this.isPlatform
        ? (settlementRuleFromForm(f.settlement) ?? undefined)
        : undefined,
    };
    // Reativação (false -> true) não tem rota própria: viaja junto do update genérico.
    if (!e.active && f.active) patch.active = true;
    await this.svc.update(e.id, patch);
    // Desativação (true -> false) usa a rota de inativação (guards no servidor).
    if (e.active && !f.active) await this.svc.inactivate(e.id);
    if (!e.isDefault && f.isDefault) await this.svc.setDefault(e.id);
  }

  async handleToggle(a: Account, v: boolean): Promise<void> {
    if (v) {
      try {
        await this.svc.update(a.id, { active: true });
        this.toast.success(`${a.name} foi reativada.`);
      } catch (err) {
        this.toast.error(this.errMsg(err));
      }
      return;
    }
    if (this.activeCount() <= 1) {
      this.toast.error('Não é possível desativar a única conta ativa do sistema.');
      return;
    }
    if (a.balance !== 0 || a.predictedBalance !== 0) {
      this.blocked.set(a);
      return;
    }
    if (a.isDefault) {
      this.reassign.set(a);
      this.selectedReassignId.set(null);
      return;
    }
    try {
      await this.svc.inactivate(a.id);
      this.toast.info(`${a.name} foi desativada.`);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    }
  }

  async confirmReassign(): Promise<void> {
    const target = this.reassign();
    const newId = this.selectedReassignId();
    if (!target || !newId) return;
    try {
      await this.svc.inactivate(target.id, newId);
      this.toast.info(`${target.name} desativada. Nova conta padrão definida.`);
      this.reassign.set(null);
    } catch (err) {
      this.toast.error(this.errMsg(err));
    }
  }

  async applyDefault(): Promise<void> {
    const fn = this.pendingApply;
    this.pendingApply = null;
    this.confirmDefault.set(null);
    await fn?.();
  }

  toggleDisabled(a: Account): boolean {
    return (
      a.active &&
      (this.activeCount() <= 1 || a.balance !== 0 || a.predictedBalance !== 0 || a.isDefault)
    );
  }

  toggleReason(a: Account): string {
    if (!a.active) return '';
    if (this.activeCount() <= 1)
      return 'Esta é a única conta ativa. Crie ou ative outra conta antes de desativá-la.';
    if (a.balance !== 0 || a.predictedBalance !== 0)
      return 'Esta conta possui saldo vinculado. Zere os valores antes de desativá-la.';
    if (a.isDefault)
      return 'Conta padrão não pode ser desativada diretamente. Defina outra conta como padrão primeiro.';
    return '';
  }

  getDetails(a: Account): Account {
    return this.accounts().find((x) => x.id === a.id) ?? a;
  }

  reassignCandidates(): Account[] {
    return this.accounts().filter((a) => a.active && !a.isDefault);
  }
}

function fmtTransfer(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
