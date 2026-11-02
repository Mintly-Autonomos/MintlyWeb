import { SettlementRuleKind } from 'mintly-lib';
import {
  SETTLEMENT_KIND_OPTS,
  WEEKDAY_BUTTONS,
  emptySettlementForm,
  settlementFormError,
  settlementFormFromAccount,
  settlementRuleFromForm,
} from './settlement-form';

const form = (over: Partial<ReturnType<typeof emptySettlementForm>>) => ({
  ...emptySettlementForm(),
  ...over,
});

describe('settlement-form', () => {
  it('as quatro opções do dono, e a semana começa no domingo (0) como a API', () => {
    expect(SETTLEMENT_KIND_OPTS.map((o) => o.label)).toEqual([
      'Toda semana',
      'A cada 15 dias',
      'Uma vez por mês',
      'Dias após a venda',
    ]);
    expect(WEEKDAY_BUTTONS.map((d) => d.short)).toEqual([
      'Dom',
      'Seg',
      'Ter',
      'Qua',
      'Qui',
      'Sex',
      'Sáb',
    ]);
    expect(WEEKDAY_BUTTONS.map((d) => d.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  describe('formulário -> regra', () => {
    it('toda semana: o dia escolhido', () => {
      expect(settlementRuleFromForm(form({ kind: SettlementRuleKind.Weekly, weekday: 3 }))).toEqual(
        { kind: 'weekly', weekday: 3 },
      );
    });

    it('a cada 15 dias: os dois dias, em número', () => {
      expect(
        settlementRuleFromForm(
          form({ kind: SettlementRuleKind.Biweekly, firstDay: '5', secondDay: '20' }),
        ),
      ).toEqual({ kind: 'biweekly', firstDay: 5, secondDay: 20 });
    });

    it('uma vez por mês: o dia', () => {
      expect(
        settlementRuleFromForm(form({ kind: SettlementRuleKind.Monthly, monthDay: '10' })),
      ).toEqual({ kind: 'monthly', day: 10 });
    });

    it('dias após a venda, inclusive 0 (cai na hora)', () => {
      expect(
        settlementRuleFromForm(form({ kind: SettlementRuleKind.AfterDays, days: '7' })),
      ).toEqual({ kind: 'afterDays', days: 7 });
      expect(
        settlementRuleFromForm(form({ kind: SettlementRuleKind.AfterDays, days: '0' })),
      ).toEqual({ kind: 'afterDays', days: 0 });
    });

    it('incompleto ou inválido não gera regra', () => {
      expect(
        settlementRuleFromForm(form({ kind: SettlementRuleKind.Biweekly, firstDay: '5' })),
      ).toBeNull();
      expect(
        settlementRuleFromForm(
          form({ kind: SettlementRuleKind.Biweekly, firstDay: '10', secondDay: '10' }),
        ),
      ).toBeNull();
      expect(
        settlementRuleFromForm(form({ kind: SettlementRuleKind.Monthly, monthDay: '32' })),
      ).toBeNull();
      expect(
        settlementRuleFromForm(form({ kind: SettlementRuleKind.AfterDays, days: '' })),
      ).toBeNull();
      expect(
        settlementRuleFromForm(form({ kind: SettlementRuleKind.AfterDays, days: '1,5' })),
      ).toBeNull();
    });
  });

  describe('mensagens de erro', () => {
    it.each([
      [
        form({ kind: SettlementRuleKind.Biweekly, firstDay: '5' }),
        'Informe os dois dias do mês (de 1 a 31).',
      ],
      [
        form({ kind: SettlementRuleKind.Biweekly, firstDay: '0', secondDay: '10' }),
        'Informe os dois dias do mês (de 1 a 31).',
      ],
      [
        form({ kind: SettlementRuleKind.Biweekly, firstDay: '7', secondDay: '7' }),
        'Escolha dois dias diferentes.',
      ],
      [form({ kind: SettlementRuleKind.Monthly }), 'Informe o dia do mês (de 1 a 31).'],
      [
        form({ kind: SettlementRuleKind.AfterDays, days: '400' }),
        'Informe quantos dias (de 0 a 365).',
      ],
    ])('%#', (f, msg) => {
      expect(settlementFormError(f)).toBe(msg);
    });

    it('semana nunca dá erro (sempre há um dia escolhido)', () => {
      expect(settlementFormError(form({ kind: SettlementRuleKind.Weekly }))).toBe('');
    });
  });

  describe('conta -> formulário', () => {
    it('conta nova sem nada: começa em "toda semana", na quarta', () => {
      expect(settlementFormFromAccount({})).toMatchObject({ kind: 'weekly', weekday: 3 });
    });

    it('conta antiga (só settlementDays) abre como "dias após a venda"', () => {
      expect(settlementFormFromAccount({ settlementDays: 7 })).toMatchObject({
        kind: 'afterDays',
        days: '7',
      });
    });

    it('cada regra volta para os seus campos', () => {
      expect(
        settlementFormFromAccount({ settlementRule: { kind: 'weekly', weekday: 5 } as never }),
      ).toMatchObject({ kind: 'weekly', weekday: 5 });
      expect(
        settlementFormFromAccount({
          settlementRule: { kind: 'biweekly', firstDay: 5, secondDay: 20 } as never,
        }),
      ).toMatchObject({ kind: 'biweekly', firstDay: '5', secondDay: '20' });
      expect(
        settlementFormFromAccount({ settlementRule: { kind: 'monthly', day: 10 } as never }),
      ).toMatchObject({ kind: 'monthly', monthDay: '10' });
    });

    it('ida e volta: o que sai do formulário é a regra que entrou', () => {
      const rule = { kind: 'biweekly', firstDay: 5, secondDay: 20 } as never;
      expect(settlementRuleFromForm(settlementFormFromAccount({ settlementRule: rule }))).toEqual(
        rule,
      );
    });
  });
});
