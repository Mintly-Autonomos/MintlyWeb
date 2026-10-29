import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SubscriptionService } from '../../services/subscription.service';
import { AssinaturaSimuladorComponent } from './assinatura-simulador.component';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

describe('AssinaturaSimuladorComponent', () => {
  let refresh: ReturnType<typeof vi.fn>;
  let mockDecide: ReturnType<typeof vi.fn>;

  async function render(
    provider: 'mock' | 'mercadopago' | 'erro' = 'mock',
    pagamento: string | null = 'pay1',
  ) {
    refresh =
      provider === 'erro'
        ? vi.fn().mockRejectedValue(new Error('rede'))
        : vi.fn().mockResolvedValue({ provider });
    mockDecide = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(pagamento ? { pagamento } : {}) },
          },
        },
        { provide: SubscriptionService, useValue: { refresh, mockDecide } },
      ],
    });
    const f = TestBed.createComponent(AssinaturaSimuladorComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }

  const buttons = (f: { nativeElement: HTMLElement }) =>
    Array.from(f.nativeElement.querySelectorAll<HTMLButtonElement>('button'));
  const byLabel = (f: { nativeElement: HTMLElement }, label: string) =>
    buttons(f).find((b) => norm(b.textContent).endsWith(label))!;

  it('com o provedor simulado mostra o aviso de que nada será cobrado e as duas escolhas', async () => {
    const f = await render('mock');
    expect(norm(f.nativeElement.textContent)).toContain('Nenhum valor será cobrado');
    expect(byLabel(f, 'Aprovar pagamento')).toBeDefined();
    expect(byLabel(f, 'Recusar pagamento')).toBeDefined();
  });

  it('aprovar manda a decisão e vai para o retorno como aprovado', async () => {
    const f = await render('mock', 'pay1');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    byLabel(f, 'Aprovar pagamento').click();
    await f.whenStable();

    expect(mockDecide).toHaveBeenCalledWith('pay1', 'approved');
    expect(navigate).toHaveBeenCalledWith(['/assinatura/retorno'], {
      queryParams: { status: 'approved' },
    });
  });

  it('recusar manda a decisão e vai para o retorno como falha', async () => {
    const f = await render('mock', 'pay2');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    byLabel(f, 'Recusar pagamento').click();
    await f.whenStable();

    expect(mockDecide).toHaveBeenCalledWith('pay2', 'rejected');
    expect(navigate).toHaveBeenCalledWith(['/assinatura/retorno'], {
      queryParams: { status: 'failure' },
    });
  });

  it('erro da API aparece na tela e não segue para o retorno', async () => {
    const f = await render('mock');
    mockDecide.mockRejectedValue({
      response: { data: { message: 'Este pagamento já foi concluído.' } },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    byLabel(f, 'Aprovar pagamento').click();
    await f.whenStable();
    f.detectChanges();

    expect(norm(f.nativeElement.textContent)).toContain('Este pagamento já foi concluído.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('erro sem mensagem usa um texto padrão', async () => {
    const f = await render('mock');
    mockDecide.mockRejectedValue(new Error('rede'));
    byLabel(f, 'Aprovar pagamento').click();
    await f.whenStable();
    f.detectChanges();
    expect(norm(f.nativeElement.textContent)).toContain('Tente novamente.');
  });

  it('sem o código do pagamento na URL os botões ficam desligados', async () => {
    const f = await render('mock', null);
    expect(byLabel(f, 'Aprovar pagamento').disabled).toBe(true);
    expect(byLabel(f, 'Recusar pagamento').disabled).toBe(true);
  });

  it('com o provedor REAL a tela do simulador não funciona', async () => {
    const f = await render('mercadopago');
    expect(norm(f.nativeElement.textContent)).toContain('Simulador indisponível');
    expect(buttons(f).some((b) => /Aprovar/.test(b.textContent ?? ''))).toBe(false);
  });

  it('se não deu para consultar o provedor, também fica indisponível', async () => {
    const f = await render('erro');
    expect(norm(f.nativeElement.textContent)).toContain('Simulador indisponível');
  });

  it('"Voltar para a assinatura" no estado indisponível', async () => {
    const f = await render('mercadopago');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    byLabel(f, 'Voltar para a assinatura').click();
    expect(navigate).toHaveBeenCalledWith(['/assinatura']);
  });
});
