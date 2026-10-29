import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService } from '../../services/subscription.service';
import {
  AssinaturaRetornoComponent,
  POLL_INTERVAL_MS,
  POLL_MAX_TRIES,
  refusedByProvider,
} from './assinatura-retorno.component';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const params = (p: Record<string, string>) => convertToParamMap(p);

describe('refusedByProvider (o que o provedor informa na volta só orienta a mensagem)', () => {
  it('recusado, cancelado ou falha', () => {
    expect(refusedByProvider(params({ collection_status: 'rejected' }))).toBe(true);
    expect(refusedByProvider(params({ status: 'rejected' }))).toBe(true);
    expect(refusedByProvider(params({ status: 'failure' }))).toBe(true);
    expect(refusedByProvider(params({ collection_status: 'cancelled' }))).toBe(true);
  });

  it('aprovado, pendente ou sem informação não é recusa', () => {
    expect(refusedByProvider(params({ status: 'approved' }))).toBe(false);
    expect(refusedByProvider(params({ collection_status: 'pending' }))).toBe(false);
    expect(refusedByProvider(params({}))).toBe(false);
  });

  it('collection_status tem prioridade sobre status', () => {
    expect(refusedByProvider(params({ collection_status: 'approved', status: 'rejected' }))).toBe(
      false,
    );
  });
});

describe('AssinaturaRetornoComponent', () => {
  let refresh: ReturnType<typeof vi.fn>;
  let isPaid: ReturnType<typeof vi.fn>;
  let clearBaseline: ReturnType<typeof vi.fn>;
  let consume: ReturnType<typeof vi.fn>;

  function create(query: Record<string, string> = {}) {
    refresh = vi.fn().mockResolvedValue({ status: 'none', endsAt: null });
    isPaid = vi.fn().mockReturnValue(false);
    clearBaseline = vi.fn();
    consume = vi.fn().mockReturnValue('/auth/onboarding');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: params(query) } } },
        {
          provide: AuthService,
          useValue: {
            subscriptionState: () => ({ endsAt: '2026-12-30T12:00:00.000Z' }),
            consumeNextRouteAfterSubscription: consume,
          },
        },
        { provide: SubscriptionService, useValue: { refresh, isPaid, clearBaseline } },
      ],
    });
    const fixture = TestBed.createComponent(AssinaturaRetornoComponent);
    return fixture;
  }

  const text = (f: { nativeElement: HTMLElement }) => norm(f.nativeElement.textContent);
  const button = (f: { nativeElement: HTMLElement }, label: string) =>
    Array.from(f.nativeElement.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => norm(b.textContent) === label,
    )!;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre confirmando e consulta o estado já na chegada', async () => {
    const f = create();
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.detectChanges();
    expect(text(f)).toContain('Confirmando seu pagamento');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('continua consultando a cada 3 segundos até o pagamento ser confirmado', async () => {
    const f = create();
    isPaid.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    refresh.mockResolvedValue({ status: 'active', endsAt: '2026-12-30T12:00:00.000Z' });

    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(3);
    f.detectChanges();

    expect(text(f)).toContain('Pagamento aprovado!');
    expect(text(f)).toContain('Sua assinatura está ativa até 30/12/2026');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(3); // parou de consultar
  });

  it('"Continuar" segue para onde a assinatura manda (onboarding ou app) e limpa a base do checkout', async () => {
    const f = create();
    isPaid.mockReturnValue(true);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    button(f, 'Continuar').click();

    expect(clearBaseline).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/auth/onboarding');
  });

  it('o provedor informou recusa: mostra "não aprovado" e NEM consulta', async () => {
    const f = create({ collection_status: 'rejected' });
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    f.detectChanges();
    expect(text(f)).toContain('Pagamento não aprovado');
    expect(text(f)).toContain('Nada foi cobrado');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('"Tentar de novo" volta para a escolha do plano', async () => {
    const f = create({ status: 'failure' });
    f.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button(f, 'Tentar de novo').click();
    expect(navigate).toHaveBeenCalledWith(['/assinatura']);
  });

  it('depois de ~2 minutos sem confirmação mostra "aguardando" (Pix e boleto demoram) e para de consultar', async () => {
    const f = create({ collection_status: 'pending' });
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * (POLL_MAX_TRIES + 2));
    f.detectChanges();

    expect(refresh).toHaveBeenCalledTimes(POLL_MAX_TRIES);
    expect(text(f)).toContain('Aguardando a confirmação');
    expect(text(f)).toContain('Pix e boleto podem levar alguns minutos');
  });

  it('"Verificar de novo" recomeça a consulta e confirma se o pagamento chegou', async () => {
    const f = create();
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * (POLL_MAX_TRIES + 1));
    f.detectChanges();
    expect(text(f)).toContain('Aguardando a confirmação');

    isPaid.mockReturnValue(true);
    button(f, 'Verificar de novo').click();
    await vi.advanceTimersByTimeAsync(0);
    f.detectChanges();
    expect(text(f)).toContain('Pagamento aprovado!');
  });

  it('falha de rede numa consulta não derruba a tela: tenta de novo no próximo ciclo', async () => {
    const f = create();
    refresh
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue({ status: 'active', endsAt: 'x' });
    isPaid.mockReturnValue(true);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(f)).toContain('Confirmando seu pagamento');
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    f.detectChanges();
    expect(text(f)).toContain('Pagamento aprovado!');
  });

  it('"Voltar para a assinatura" no estado de espera', async () => {
    const f = create();
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * (POLL_MAX_TRIES + 1));
    f.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button(f, 'Voltar para a assinatura').click();
    expect(navigate).toHaveBeenCalledWith(['/assinatura']);
  });

  it('sair da tela cancela a consulta agendada', async () => {
    const f = create();
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.destroy();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
