import { SettlementRuleKind, resolveSettlementRule, validateSettlementRule } from 'mintly-lib';
import type { SettlementRule } from 'mintly-lib';

/** Estado do bloco "Quando a plataforma repassa" no formulário da conta (tudo texto, como se digita). */
export interface SettlementFormState {
  kind: SettlementRuleKind;
  /** "N dias após a venda". */
  days: string;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** Quinzenal: os dois dias do mês. */
  firstDay: string;
  secondDay: string;
  /** Mensal: o dia do mês. */
  monthDay: string;
}

export const SETTLEMENT_KIND_OPTS: { kind: SettlementRuleKind; label: string; hint: string }[] = [
  {
    kind: SettlementRuleKind.Weekly,
    label: 'Toda semana',
    hint: 'A plataforma paga num dia fixo da semana.',
  },
  {
    kind: SettlementRuleKind.Biweekly,
    label: 'A cada 15 dias',
    hint: 'A plataforma paga em dois dias fixos do mês.',
  },
  {
    kind: SettlementRuleKind.Monthly,
    label: 'Uma vez por mês',
    hint: 'A plataforma paga num dia fixo do mês.',
  },
  {
    kind: SettlementRuleKind.AfterDays,
    label: 'Dias após a venda',
    hint: 'Cada venda cai depois de um número de dias.',
  },
];

/** Dias da semana na ordem do calendário, com o número que a API usa (0 = domingo). */
export const WEEKDAY_BUTTONS: { value: number; short: string; full: string }[] = [
  { value: 0, short: 'Dom', full: 'domingo' },
  { value: 1, short: 'Seg', full: 'segunda' },
  { value: 2, short: 'Ter', full: 'terça' },
  { value: 3, short: 'Qua', full: 'quarta' },
  { value: 4, short: 'Qui', full: 'quinta' },
  { value: 5, short: 'Sex', full: 'sexta' },
  { value: 6, short: 'Sáb', full: 'sábado' },
];

export function emptySettlementForm(): SettlementFormState {
  return {
    kind: SettlementRuleKind.Weekly,
    days: '',
    weekday: 3,
    firstDay: '',
    secondDay: '',
    monthDay: '',
  };
}

/** Conta existente -> formulário. Conta antiga (só `settlementDays`) abre como "dias após a venda". */
export function settlementFormFromAccount(account: {
  settlementRule?: SettlementRule | null;
  settlementDays?: number | null;
}): SettlementFormState {
  const form = emptySettlementForm();
  const rule = resolveSettlementRule(account);
  if (!rule) return form;
  form.kind = rule.kind;
  switch (rule.kind) {
    case SettlementRuleKind.Weekly:
      form.weekday = rule.weekday;
      break;
    case SettlementRuleKind.Biweekly:
      form.firstDay = String(rule.firstDay);
      form.secondDay = String(rule.secondDay);
      break;
    case SettlementRuleKind.Monthly:
      form.monthDay = String(rule.day);
      break;
    default:
      form.days = String(rule.days);
  }
  return form;
}

const wholeNumber = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) ? n : null;
};

/** O que está faltando ou errado no bloco (texto para a tela), ou `''` quando está pronto. */
export function settlementFormError(f: SettlementFormState): string {
  switch (f.kind) {
    case SettlementRuleKind.Weekly:
      return '';
    case SettlementRuleKind.Biweekly: {
      const a = wholeNumber(f.firstDay);
      const b = wholeNumber(f.secondDay);
      if (a === null || b === null || a < 1 || a > 31 || b < 1 || b > 31) {
        return 'Informe os dois dias do mês (de 1 a 31).';
      }
      return a === b ? 'Escolha dois dias diferentes.' : '';
    }
    case SettlementRuleKind.Monthly: {
      const d = wholeNumber(f.monthDay);
      return d === null || d < 1 || d > 31 ? 'Informe o dia do mês (de 1 a 31).' : '';
    }
    default: {
      const n = wholeNumber(f.days);
      return n === null || n < 0 || n > 365 ? 'Informe quantos dias (de 0 a 365).' : '';
    }
  }
}

/** Formulário -> regra enviada à API; `null` enquanto estiver incompleto ou inválido. */
export function settlementRuleFromForm(f: SettlementFormState): SettlementRule | null {
  if (settlementFormError(f)) return null;
  let rule: SettlementRule;
  switch (f.kind) {
    case SettlementRuleKind.Weekly:
      rule = { kind: SettlementRuleKind.Weekly, weekday: f.weekday };
      break;
    case SettlementRuleKind.Biweekly:
      rule = {
        kind: SettlementRuleKind.Biweekly,
        firstDay: Number(f.firstDay),
        secondDay: Number(f.secondDay),
      };
      break;
    case SettlementRuleKind.Monthly:
      rule = { kind: SettlementRuleKind.Monthly, day: Number(f.monthDay) };
      break;
    default:
      rule = { kind: SettlementRuleKind.AfterDays, days: Number(f.days) };
  }
  return validateSettlementRule(rule) ? null : rule;
}
