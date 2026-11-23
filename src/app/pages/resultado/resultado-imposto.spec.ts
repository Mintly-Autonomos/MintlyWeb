import { explicacaoImposto } from './resultado.component';

// Reteste 22/11, T1: o DAS do MEI é fixo e a linha diz quando foi estimado pelos pagamentos.
describe('explicacaoImposto', () => {
  const nbsp = (s: string) => s.replace(/\s/g, ' ');

  it('MEI com o DAS estimado pelos pagamentos', () => {
    const t = nbsp(
      explicacaoImposto({ regime: 'mei', meiMonthlyDas: 81.05, meiDasEstimated: true }),
    );
    expect(t).toContain('DAS-MEI fixo de R$ 81,05 por mês, estimado pelos DAS pagos');
  });

  it('MEI com o valor configurado e Simples', () => {
    expect(nbsp(explicacaoImposto({ regime: 'mei', meiMonthlyDas: 82.05 }))).toContain(
      'DAS-MEI fixo de R$ 82,05 por mês',
    );
    expect(explicacaoImposto({ regime: 'simplesNacionalAnexoI', meiMonthlyDas: null })).toContain(
      'conforme o regime tributário',
    );
  });
});
