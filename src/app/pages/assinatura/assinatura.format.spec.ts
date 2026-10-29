import { computeSubscriptionState, subscriptionPlanPrice } from 'mintly-lib';
import {
  expiryNoticeText,
  fmtEndsAt,
  formatCents,
  planLabel,
  planPerMonthLabel,
  planSavingCents,
  subscriptionHeadline,
} from './assinatura.format';

const DAY = 24 * 60 * 60 * 1000;
const NBSP = /\s/g;
const norm = (s: string) => s.replace(NBSP, ' ');

describe('formatCents', () => {
  it('mostra centavos inteiros em reais', () => {
    expect(norm(formatCents(15000))).toBe('R$ 150,00');
    expect(norm(formatCents(42750))).toBe('R$ 427,50');
    expect(norm(formatCents(153000))).toBe('R$ 1.530,00');
  });
});

describe('planLabel', () => {
  it('singular e plural', () => {
    expect(planLabel(1)).toBe('1 mês');
    expect(planLabel(3)).toBe('3 meses');
    expect(planLabel(12)).toBe('12 meses');
  });
});

describe('preço por mês e economia', () => {
  it('3 meses: R$ 142,50 por mês e economiza R$ 22,50', () => {
    const plan = subscriptionPlanPrice(3);
    expect(norm(planPerMonthLabel(plan))).toBe('R$ 142,50 por mês');
    expect(planSavingCents(plan)).toBe(2250);
  });

  it('12 meses economiza R$ 270,00; 1 mês não economiza nada', () => {
    expect(planSavingCents(subscriptionPlanPrice(12))).toBe(27000);
    expect(planSavingCents(subscriptionPlanPrice(1))).toBe(0);
  });
});

describe('fmtEndsAt', () => {
  it('vazio sem data; dia/mês/ano com data', () => {
    expect(fmtEndsAt(null)).toBe('');
    expect(fmtEndsAt('2026-11-30T15:00:00.000Z')).toBe('30/11/2026');
  });
});

describe('subscriptionHeadline', () => {
  const now = new Date();

  it('sem assinatura: convida a escolher o plano', () => {
    const h = subscriptionHeadline(computeSubscriptionState(null, now));
    expect(h.title).toBe('Escolha seu plano');
    expect(h.subtitle).toContain('por assinatura');
  });

  it('vencida: diz quando terminou', () => {
    const end = new Date(now.getTime() - 5 * DAY);
    const h = subscriptionHeadline(computeSubscriptionState(end, now));
    expect(h.title).toBe('Sua assinatura venceu');
    expect(h.subtitle).toContain(fmtEndsAt(end.toISOString()));
  });

  it('ativa: mostra até quando vale e que renovar soma ao que resta', () => {
    const end = new Date(now.getTime() + 20 * DAY);
    const h = subscriptionHeadline(computeSubscriptionState(end, now));
    expect(h.title).toBe('Sua assinatura');
    expect(h.subtitle).toContain(fmtEndsAt(end.toISOString()));
    expect(h.subtitle).toContain('soma');
  });
});

describe('expiryNoticeText (aviso 3 dias antes)', () => {
  const now = new Date();
  const state = (days: number) =>
    computeSubscriptionState(new Date(now.getTime() + days * DAY - 1000), now);

  it('sem aviso quando falta muito, quando venceu ou quando nunca assinou', () => {
    expect(expiryNoticeText(state(10))).toBeNull();
    expect(expiryNoticeText(state(4))).toBeNull();
    expect(
      expiryNoticeText(computeSubscriptionState(new Date(now.getTime() - DAY), now)),
    ).toBeNull();
    expect(expiryNoticeText(computeSubscriptionState(null, now))).toBeNull();
  });

  it('a 3 dias e a 2 dias avisa no plural', () => {
    expect(expiryNoticeText(state(3))?.title).toBe('Sua assinatura vence em 3 dias');
    expect(expiryNoticeText(state(2))?.title).toBe('Sua assinatura vence em 2 dias');
  });

  it('faltando menos de um dia avisa "1 dia"', () => {
    const s = computeSubscriptionState(new Date(now.getTime() + 3 * 60 * 60 * 1000), now);
    expect(expiryNoticeText(s)?.title).toBe('Sua assinatura vence em 1 dia');
  });

  it('a descrição diz a data e que renovar soma ao que resta', () => {
    const text = expiryNoticeText(state(2));
    expect(text?.description).toContain('Renove agora');
    expect(text?.description).toContain('somado');
  });
});
