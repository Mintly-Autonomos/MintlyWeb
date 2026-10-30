import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { computeSubscriptionState, subscriptionTiers } from 'mintly-lib';
import type { SubscriptionOverview, SubscriptionTier } from 'mintly-lib';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService } from '../../services/subscription.service';
import { AssinaturaComponent } from './assinatura.component';

const DAY = 24 * 60 * 60 * 1000;
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

describe('AssinaturaComponent', () => {
  let overview: ReturnType<typeof signal<SubscriptionOverview | null>>;
  let refresh: ReturnType<typeof vi.fn>;
  let checkout: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;
  let endsAt: string | null;
  let tier: SubscriptionTier | null;

  const ov = (
    provider: 'mock' | 'mercadopago',
    ends: string | null = null,
    ovTier: SubscriptionTier | null = tier,
  ): SubscriptionOverview => ({
    ...computeSubscriptionState(ends, new Date(), ovTier),
    tiers: subscriptionTiers(),
    provider,
  });

  async function render(initial: SubscriptionOverview | null = ov('mock')) {
    overview = signal(initial);
    refresh = vi.fn().mockResolvedValue(initial);
    checkout = vi.fn().mockResolvedValue({
      paymentId: 'p1',
      checkoutUrl: '/assinatura/simulador?pagamento=p1',
      provider: 'mock',
      tier: 'basic',
      months: 3,
      totalCents: 42750,
    });
    logout = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            subscriptionState: () => computeSubscriptionState(endsAt, new Date(), tier),
            logout,
          },
        },
        { provide: SubscriptionService, useValue: { overview, refresh, checkout } },
      ],
    });
    const fixture = TestBed.createComponent(AssinaturaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: { nativeElement: HTMLElement }) => f.nativeElement;
  /** Os períodos (1, 3, 6, 12 meses) do tipo escolhido. */
  const radios = (f: { nativeElement: HTMLElement }) =>
    Array.from(
      el(f).querySelectorAll<HTMLButtonElement>(
        '[aria-label="Período da assinatura"] [role="radio"]',
      ),
    );
  /** Os tipos (Básico e Pro). */
  const tierCards = (f: { nativeElement: HTMLElement }) =>
    Array.from(
      el(f).querySelectorAll<HTMLButtonElement>('[aria-label="Tipo de assinatura"] [role="radio"]'),
    );
  const payButton = (f: { nativeElement: HTMLElement }) =>
    Array.from(el(f).querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      /Pagar|Abrindo/.test(norm(b.textContent)),
    )!;

  beforeEach(() => {
    endsAt = null;
    tier = null;
  });

  it('mostra os 4 planos com preço total e desconto', async () => {
    const f = await render();
    const texts = radios(f).map((r) => norm(r.textContent));
    expect(texts).toHaveLength(4);
    expect(texts[0]).toContain('1 mês');
    expect(texts[0]).toContain('R$ 150,00');
    expect(texts[0]).not.toContain('desconto');
    expect(texts[1]).toContain('3 meses');
    expect(texts[1]).toContain('5% de desconto');
    expect(texts[1]).toContain('R$ 427,50');
    expect(texts[2]).toContain('10% de desconto');
    expect(texts[2]).toContain('R$ 810,00');
    expect(texts[3]).toContain('15% de desconto');
    expect(texts[3]).toContain('R$ 1.530,00');
  });

  it('mostra o preço por mês e quanto se economiza', async () => {
    const f = await render();
    const three = norm(radios(f)[1].textContent);
    expect(three).toContain('R$ 142,50 por mês');
    expect(three).toContain('você economiza R$ 22,50');
  });

  it('o plano de 3 meses já vem marcado e o botão mostra o valor a pagar', async () => {
    const f = await render();
    expect(radios(f).map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(norm(payButton(f).textContent)).toContain('Pagar R$ 427,50');
  });

  it('trocar de plano muda a marcação e o valor do botão', async () => {
    const f = await render();
    radios(f)[3].click();
    f.detectChanges();
    expect(radios(f)[3].getAttribute('aria-checked')).toBe('true');
    expect(norm(payButton(f).textContent)).toContain('Pagar R$ 1.530,00');
  });

  it('pagar cria a cobrança do plano escolhido e vai para o endereço devolvido', async () => {
    const f = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    radios(f)[2].click();
    f.detectChanges();

    payButton(f).click();
    await f.whenStable();

    expect(checkout).toHaveBeenCalledWith(6, 'basic');
    expect(navigate).toHaveBeenCalledWith('/assinatura/simulador?pagamento=p1');
  });

  it('erro ao criar a cobrança aparece na tela, com a mensagem da API quando há', async () => {
    const f = await render();
    checkout.mockRejectedValue({
      response: { data: { message: 'Plano inválido: escolha 1, 3, 6 ou 12 meses.' } },
    });
    payButton(f).click();
    await f.whenStable();
    f.detectChanges();
    expect(norm(el(f).textContent)).toContain('Não foi possível iniciar o pagamento');
    expect(norm(el(f).textContent)).toContain('Plano inválido');
  });

  it('erro sem mensagem usa um texto padrão', async () => {
    const f = await render();
    checkout.mockRejectedValue(new Error('rede'));
    payButton(f).click();
    await f.whenStable();
    f.detectChanges();
    expect(norm(el(f).textContent)).toContain('Tente novamente em instantes.');
  });

  it('provedor simulado avisa que é ambiente de teste e que nada será cobrado', async () => {
    const f = await render(ov('mock'));
    expect(norm(el(f).textContent)).toContain('Ambiente de teste');
    expect(norm(el(f).textContent)).toContain('Nenhum pagamento de verdade será cobrado');
  });

  it('provedor real fala do Mercado Pago e não mostra o aviso de teste', async () => {
    const f = await render(ov('mercadopago'));
    expect(norm(el(f).textContent)).not.toContain('Ambiente de teste');
    expect(norm(el(f).textContent)).toContain('ambiente seguro do Mercado Pago');
  });

  it('sem assinatura: título para escolher o plano e sem "Voltar para o app"', async () => {
    const f = await render(ov('mock'));
    expect(norm(el(f).textContent)).toContain('Escolha seu plano');
    expect(norm(el(f).textContent)).not.toContain('Voltar para o app');
  });

  it('vencida: diz que venceu', async () => {
    endsAt = new Date(Date.now() - 3 * DAY).toISOString();
    const f = await render(ov('mock', endsAt));
    expect(norm(el(f).textContent)).toContain('Sua assinatura venceu');
  });

  it('ativa (renovação): mostra a validade e oferece voltar ao app', async () => {
    endsAt = new Date(Date.now() + 20 * DAY).toISOString();
    const f = await render(ov('mock', endsAt));
    expect(norm(el(f).textContent)).toContain('Sua assinatura');
    expect(norm(el(f).textContent)).toContain('Renovar o mesmo plano soma');
    expect(norm(el(f).textContent)).toContain('trocar de plano começa a contar hoje');
    expect(norm(el(f).textContent)).toContain('Voltar para o app');
  });

  it('não conseguiu carregar: mostra o erro e "Tentar de novo" refaz a consulta', async () => {
    const f = await render(null);
    refresh.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(ov('mock'));
    (f.componentInstance as unknown as { load: () => Promise<void> }).load();
    await f.whenStable();
    f.detectChanges();
    expect(norm(el(f).textContent)).toContain('Não foi possível carregar os planos');

    const retry = Array.from(el(f).querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => norm(b.textContent) === 'Tentar de novo',
    )!;
    retry.click();
    await f.whenStable();
    f.detectChanges();
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(norm(el(f).textContent)).not.toContain('Não foi possível carregar os planos');
  });

  it('antes da API responder já mostra os planos da própria lib', async () => {
    const f = await render(null);
    expect(radios(f)).toHaveLength(4);
  });

  describe('tipos: Básico e Pro', () => {
    it('mostra Básico e Pro com o valor mensal, e o Pro sem promessa de recurso específico', async () => {
      const f = await render();
      const texts = tierCards(f).map((r) => norm(r.textContent));
      expect(texts).toHaveLength(2);
      expect(texts[0]).toContain('Básico');
      expect(texts[0]).toContain('R$ 150,00 por mês');
      expect(texts[1]).toContain('Pro');
      expect(texts[1]).toContain('R$ 229,00 por mês');
      expect(texts[1]).toContain('recursos exclusivos do Pro chegarão em breve');
    });

    it('sem assinatura começa no Básico', async () => {
      const f = await render();
      expect(tierCards(f).map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    });

    it('escolher o Pro troca os preços dos 4 períodos, com os mesmos descontos', async () => {
      const f = await render();
      tierCards(f)[1].click();
      f.detectChanges();
      const texts = radios(f).map((r) => norm(r.textContent));
      expect(texts).toHaveLength(4);
      expect(texts[0]).toContain('R$ 229,00');
      expect(texts[1]).toContain('5% de desconto');
      expect(texts[1]).toContain('R$ 652,65');
      expect(texts[2]).toContain('10% de desconto');
      expect(texts[2]).toContain('R$ 1.236,60');
      expect(texts[3]).toContain('15% de desconto');
      expect(texts[3]).toContain('R$ 2.335,80');
      expect(norm(payButton(f).textContent)).toContain('Pagar R$ 652,65 · Pro');
    });

    it('pagar o Pro manda o tipo junto com o período', async () => {
      const f = await render();
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      tierCards(f)[1].click();
      f.detectChanges();
      radios(f)[0].click();
      f.detectChanges();
      payButton(f).click();
      await f.whenStable();
      expect(checkout).toHaveBeenCalledWith(1, 'pro');
    });

    it('quem já tem o Pro abre no Pro, marcado como "Seu plano", sem aviso de troca', async () => {
      endsAt = new Date(Date.now() + 20 * DAY).toISOString();
      tier = 'pro';
      const f = await render(ov('mock', endsAt, 'pro'));
      expect(tierCards(f).map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']);
      expect(norm(tierCards(f)[1].textContent)).toContain('Seu plano');
      expect(norm(tierCards(f)[0].textContent)).not.toContain('Seu plano');
      expect(norm(el(f).textContent)).not.toContain('Você está mudando');
      expect(norm(el(f).textContent)).toContain('Plano Pro ativo até');
    });

    it('UPGRADE (Básico → Pro) com tempo sobrando: avisa que não há crédito e que conta de hoje', async () => {
      endsAt = new Date(Date.now() + 20 * DAY).toISOString();
      tier = 'basic';
      const f = await render(ov('mock', endsAt, 'basic'));
      tierCards(f)[1].click();
      f.detectChanges();
      const text = norm(el(f).textContent);
      expect(text).toContain('Você está mudando do Básico para o Pro');
      expect(text).toContain('não dá desconto nem crédito');
      expect(text).toContain('o Pro começa a contar hoje, não quando o Básico terminaria');
      expect(text).not.toContain('Você perde os recursos do Pro');
    });

    it('DOWNGRADE (Pro → Básico) com tempo sobrando: descreve a regra e avisa que perde os recursos do Pro', async () => {
      endsAt = new Date(Date.now() + 20 * DAY).toISOString();
      tier = 'pro';
      const f = await render(ov('mock', endsAt, 'pro'));
      tierCards(f)[0].click();
      f.detectChanges();
      const text = norm(el(f).textContent);
      expect(text).toContain('Você está mudando do Pro para o Básico');
      expect(text).toContain('não dá desconto nem crédito');
      expect(text).toContain('o Básico começa a contar hoje, não quando o Pro terminaria');
      expect(text).toContain('Você perde os recursos do Pro');
    });

    it('voltar para o tipo atual tira o aviso', async () => {
      endsAt = new Date(Date.now() + 20 * DAY).toISOString();
      tier = 'pro';
      const f = await render(ov('mock', endsAt, 'pro'));
      tierCards(f)[0].click();
      f.detectChanges();
      tierCards(f)[1].click();
      f.detectChanges();
      expect(norm(el(f).textContent)).not.toContain('Você está mudando');
    });

    it('vencida: trocar de tipo não mostra aviso (não há tempo a perder)', async () => {
      endsAt = new Date(Date.now() - 3 * DAY).toISOString();
      tier = 'pro';
      const f = await render(ov('mock', endsAt, 'pro'));
      tierCards(f)[0].click();
      f.detectChanges();
      expect(norm(el(f).textContent)).not.toContain('Você está mudando');
    });
  });

  it('"Sair da conta" faz logout', async () => {
    const f = await render();
    Array.from(el(f).querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => norm(b.textContent).endsWith('Sair da conta'))!
      .click();
    expect(logout).toHaveBeenCalled();
  });
});
