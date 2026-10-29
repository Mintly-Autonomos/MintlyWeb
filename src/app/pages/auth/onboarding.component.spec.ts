import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { OnboardingComponent, onboardingSteps } from './onboarding.component';
import { ContasService } from '../../services/contas.service';
import { CategoriasService } from '../../services/categorias.service';
import { ToastService } from '../../shared/toast.service';

describe('onboardingSteps', () => {
  it('usa o que a conta tem quando já foi carregado', () => {
    const [conta, cats, pronto] = onboardingSteps('Caixa', ['Venda Balcão', 'Aluguel']);
    expect(conta.text).toBe('Conta inicial pronta: Caixa.');
    expect(cats.text).toBe('Venda Balcão, Aluguel.');
    expect(pronto.title).toContain('estrutura financeira');
  });

  it('antes de carregar, mostra os textos padrão', () => {
    const [conta, cats] = onboardingSteps(null, []);
    expect(conta.text).toContain('conta inicial');
    expect(cats.text).toContain('Venda Balcão');
  });
});

describe('OnboardingComponent', () => {
  const contas = {
    accounts: signal([{ name: 'Caixa', active: true, isDefault: true }]),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
  const categorias = {
    categories: signal([
      { name: 'Venda Balcão', active: true },
      { name: 'Aluguel', active: true },
      { name: 'Antiga', active: false },
    ]),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
  const toast = { error: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    contas.refresh.mockClear().mockResolvedValue(undefined);
    categorias.refresh.mockClear().mockResolvedValue(undefined);
    toast.error.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ContasService, useValue: contas },
        { provide: CategoriasService, useValue: categorias },
        { provide: ToastService, useValue: toast },
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('abre nas boas-vindas, com "Começar" e "Já configurei, ir para o login"', () => {
    const fixture = TestBed.createComponent(OnboardingComponent);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Bem-vindo ao Mintly');
    expect(text(fixture)).toContain('Começar');
    expect(text(fixture)).toContain('Já configurei, ir para o login');
    expect(contas.refresh).not.toHaveBeenCalled();
  });

  it('"Já configurei" vai para o login', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(OnboardingComponent);
    fixture.detectChanges();
    fixture.componentInstance.goLogin();
    expect(navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('"Começar" confere conta e categorias, passa pelos 3 passos e libera "Acessar minha conta"', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(OnboardingComponent);
    fixture.detectChanges();

    const started = fixture.componentInstance.start();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Estamos preparando sua conta');
    expect(text(fixture)).toContain('Preparando…');

    // "Acessar minha conta" ainda não faz nada antes de terminar.
    fixture.componentInstance.enter();
    expect(navigate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(900 * 3 + 50);
    await started;
    fixture.detectChanges();

    expect(contas.refresh).toHaveBeenCalledTimes(1);
    expect(categorias.refresh).toHaveBeenCalledTimes(1);
    expect(text(fixture)).toContain('Pronto! Sua conta está preparada');
    expect(text(fixture)).toContain('Conta inicial pronta: Caixa.');
    expect(text(fixture)).toContain('Categorias criadas');
    // só as categorias ativas viram chip
    expect(text(fixture)).toContain('Venda Balcão');
    expect(text(fixture)).not.toContain('Antiga');

    fixture.componentInstance.enter();
    expect(navigate).toHaveBeenCalledWith(['/contas']);
  });

  it('se não der para conferir, avisa e segue (a conta já foi criada no cadastro)', async () => {
    contas.refresh.mockRejectedValueOnce(new Error('rede'));
    const fixture = TestBed.createComponent(OnboardingComponent);
    fixture.detectChanges();
    const started = fixture.componentInstance.start();
    await vi.advanceTimersByTimeAsync(900 * 4 + 50);
    await started;
    fixture.detectChanges();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(text(fixture)).toContain('Pronto! Sua conta está preparada');
  });
});
