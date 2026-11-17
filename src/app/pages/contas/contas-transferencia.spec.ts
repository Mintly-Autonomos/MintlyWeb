import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContasComponent } from './contas.component';
import { Account, ContasService } from '../../services/contas.service';
import { ToastService } from '../../shared/toast.service';
import { AuthService } from '../../services/auth.service';

const conta = (over: Partial<Account>): Account =>
  ({
    id: 'x',
    name: 'Conta',
    type: 'Bank',
    active: true,
    isDefault: false,
    balance: 0,
    predictedBalance: 0,
    createdBy: '—',
    createdAt: '2026-01-01',
    updatedBy: '—',
    updatedAt: '2026-01-01',
    history: [],
    ...over,
  }) as Account;

interface Interno {
  openTransfer(): void;
  transferForm(): { fromId: string; toId: string };
  transferProblema(): string | null;
  setTransfer(campo: string, valor: string): void;
  confirmTransfer(): Promise<void>;
  transferOpen(): boolean;
  openOpening(a: Account): void;
  setOpening(campo: string, valor: string): void;
  confirmOpening(): Promise<void>;
}

describe('Contas: transferir entre contas e saldo inicial (relatório S3.2)', () => {
  function montar(contas: Account[]) {
    const svc = {
      accounts: signal(contas),
      loading: signal(false),
      refresh: vi.fn().mockResolvedValue(undefined),
      transfer: vi.fn().mockResolvedValue(undefined),
      setOpeningBalance: vi.fn().mockResolvedValue(undefined),
    };
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { podeMudarCadastros: signal(true) } },
        { provide: ContasService, useValue: svc },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(ContasComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const q = (id: string) => root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    return { fixture, root, q, svc, toast, c: fixture.componentInstance as unknown as Interno };
  }

  const tres = [
    conta({ id: 'nu', name: 'Nubank', isDefault: true, balance: -500 }),
    conta({ id: 'if', name: 'iFood', type: 'Financial Platform', balance: 43_780 }),
    conta({ id: 'cx', name: 'Caixa', type: 'Cash Register', balance: 200 }),
  ];

  it('com uma conta só não há o que transferir; com duas, aparece o botão', () => {
    expect(montar([tres[0]]).q('abrir-transferencia')).toBeNull();
    TestBed.resetTestingModule();
    expect(montar(tres).q('abrir-transferencia')).not.toBeNull();
  });

  it('abre sugerindo da plataforma com mais saldo para a conta padrão', () => {
    const { c } = montar(tres);
    c.openTransfer();
    expect(c.transferForm()).toMatchObject({ fromId: 'if', toId: 'nu' });
  });

  it('valida: mesma conta, sem valor e data no futuro', () => {
    const { c } = montar(tres);
    c.openTransfer();
    expect(c.transferProblema()).toBe('Informe o valor.');
    c.setTransfer('valor', '1.500,00');
    expect(c.transferProblema()).toBeNull();
    c.setTransfer('toId', 'if');
    expect(c.transferProblema()).toBe('A origem e o destino precisam ser contas diferentes.');
    c.setTransfer('toId', 'nu');
    c.setTransfer('data', '2999-01-01');
    expect(c.transferProblema()).toBe('A data não pode estar no futuro.');
  });

  it('transferir manda o valor em número e avisa com as duas contas', async () => {
    const { c, svc, toast } = montar(tres);
    c.openTransfer();
    c.setTransfer('valor', '1.500,50');
    c.setTransfer('descricao', '  repasse da semana  ');
    await c.confirmTransfer();
    expect(svc.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        fromId: 'if',
        toId: 'nu',
        amount: 1500.5,
        description: 'repasse da semana',
      }),
    );
    expect(toast.success.mock.calls[0][0]).toMatch(
      /Transferência de R\$\s?1\.500,50 de iFood para Nubank registrada\./,
    );
    expect(c.transferOpen()).toBe(false);
  });

  it('erro da API: avisa e mantém o modal aberto', async () => {
    const { c, svc, toast } = montar(tres);
    svc.transfer.mockRejectedValueOnce(
      new Error('Conta inativa não pode receber lançamentos financeiros.'),
    );
    c.openTransfer();
    c.setTransfer('valor', '10,00');
    await c.confirmTransfer();
    expect(toast.error).toHaveBeenCalled();
    expect(c.transferOpen()).toBe(true);
  });

  it('saldo inicial: salva o valor da conta escolhida; 0,00 remove', async () => {
    const { c, svc, toast } = montar(tres);
    c.openOpening(tres[0]);
    c.setOpening('valor', '18.500,00');
    c.setOpening('data', '2026-05-01');
    await c.confirmOpening();
    expect(svc.setOpeningBalance).toHaveBeenCalledWith('nu', 18_500, '2026-05-01');
    expect(toast.success).toHaveBeenCalledWith('Saldo inicial de Nubank definido.');
    c.openOpening(tres[0]);
    c.setOpening('data', '2026-05-01');
    await c.confirmOpening();
    expect(svc.setOpeningBalance).toHaveBeenLastCalledWith('nu', 0, '2026-05-01');
    expect(toast.success).toHaveBeenLastCalledWith('Saldo inicial de Nubank removido.');
  });

  it('cada conta ativa tem o botão de saldo inicial', () => {
    const { root } = montar(tres);
    expect(root.querySelectorAll('button[title="Saldo inicial"]').length).toBe(3);
  });
});
