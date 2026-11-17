import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformKind } from 'mintly-lib';
import { ContasComponent } from './contas.component';
import { Account, ContasService } from '../../services/contas.service';
import { ToastService } from '../../shared/toast.service';
import { AuthService } from '../../services/auth.service';
import { CustosComponent } from '../custos/custos.component';
import { CustosService } from '../../services/custos.service';

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
  openCreate(): void;
  openEdit(a: Account): void;
  setFormType(t: string): void;
  setFormName(n: string): void;
  setFormTaxPct(v: string): void;
  setFormPlatformKind(k: PlatformKind): void;
  setFormFeeByMethod(m: string, v: string): void;
  setSettlementKind(k: string): void;
  setSettlementField(f: string, v: string): void;
  form(): { platformKind: PlatformKind; feeByMethod: Record<string, string> };
  feeByMethodError: string;
  saveDisabled: boolean;
  save(): Promise<void>;
}

describe('Contas: maquininha e taxa por forma de pagamento (relatório S3.3)', () => {
  function montar(contas: Account[]) {
    const svc = {
      accounts: signal(contas),
      loading: signal(false),
      refresh: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue('nova'),
      update: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { podeMudarCadastros: signal(true) } },
        { provide: ContasService, useValue: svc },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ContasComponent);
    fixture.detectChanges();
    return {
      fixture,
      root: fixture.nativeElement as HTMLElement,
      svc,
      c: fixture.componentInstance as unknown as Interno,
    };
  }

  const stone = conta({
    id: 'st',
    name: 'Stone',
    type: 'Financial Platform',
    taxPct: 2.5,
    settlementDays: 1,
    platformKind: PlatformKind.CardMachine,
    feeByMethod: { debit: 1.2, credit: 3.1 },
  });

  it('cria a maquininha com a taxa padrão e as taxas por forma preenchidas', async () => {
    const { c, svc } = montar([
      conta({ id: 'cx', name: 'Caixa', type: 'Cash Register', isDefault: true }),
    ]);
    c.openCreate();
    c.setFormType('Financial Platform');
    c.setFormName('Stone');
    c.setFormTaxPct('2.5');
    c.setFormPlatformKind(PlatformKind.CardMachine);
    c.setFormFeeByMethod('debit', '1,2');
    c.setFormFeeByMethod('credit', '3.1');
    c.setSettlementKind('afterDays');
    c.setSettlementField('days', '1');
    await c.save();
    expect(svc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        platformKind: PlatformKind.CardMachine,
        taxPct: 2.5,
        feeByMethod: { debit: 1.2, credit: 3.1 },
      }),
    );
  });

  it('taxa por forma fora de 0..100 trava o salvar', () => {
    const { c } = montar([stone]);
    c.openEdit(stone);
    c.setFormFeeByMethod('pix', '120');
    expect(c.feeByMethodError).toBe('Taxa do pix: informe entre 0% e 100%.');
    expect(c.saveDisabled).toBe(true);
  });

  it('editar abre com o tipo e as taxas da conta; limpar uma forma manda só as que ficaram', async () => {
    const { c, svc } = montar([stone]);
    c.openEdit(stone);
    expect(c.form().platformKind).toBe(PlatformKind.CardMachine);
    expect(c.form().feeByMethod).toMatchObject({ debit: '1.2', credit: '3.1', pix: '' });
    c.setFormFeeByMethod('debit', '');
    await c.save();
    expect(svc.update).toHaveBeenCalledWith(
      'st',
      expect.objectContaining({
        platformKind: PlatformKind.CardMachine,
        feeByMethod: { credit: 3.1 },
      }),
    );
  });

  it('o card mostra que é maquininha e as taxas por forma', () => {
    const { root } = montar([
      stone,
      conta({ id: 'if', name: 'iFood', type: 'Financial Platform', taxPct: 12 }),
    ]);
    const tipos = [...root.querySelectorAll('[data-testid="tipo-plataforma-card"]')].map((e) =>
      e.textContent!.trim(),
    );
    expect(tipos.some((t) => t.includes('Maquininha'))).toBe(true);
    expect(tipos.some((t) => t.includes('App de delivery'))).toBe(true);
    expect(root.querySelector('[data-testid="taxa-por-forma-card"]')!.textContent!.trim()).toBe(
      'Débito 1,2% · Crédito 3,1%',
    );
  });
});

describe('Custos: taxa da maquininha separada da comissão dos apps (S3.3)', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  function render(cardFee: unknown) {
    const data = {
      referenceMonth: '2026-10',
      revenue: { current: 1500, previous: 0 },
      total: { current: 90, deltaPrevious: null },
      cmv: { pctOfRevenue: 0, amount: 0, target: { min: 0.28, max: 0.35 } },
      primeCost: { pctOfRevenue: 0, cmv: 0, labor: 0, targetMax: 0.65 },
      platformFee: { amount: 60, deltaPrevious: null, pctOfDelivery: 0.12 },
      cardFee,
      byBehavior: { fixed: 0, variable: 90, mixed: 0 },
      anomalies: [],
      history: [],
      items: [],
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CustosService,
          useValue: {
            data: signal(data),
            loading: signal(false),
            refresh: vi.fn(() => Promise.resolve()),
          },
        },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(CustosComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('com maquininha: a comissão dos apps fica no valor e a maquininha embaixo, separada', () => {
    const root = render({
      amount: 30,
      previous: 0,
      deltaPrevious: null,
      cardRevenue: 1000,
      pctOfCardRevenue: 0.03,
    });
    expect(root.textContent).toMatch(/Maquininha: R\$\s?30,00 \(3% das vendas nela\)/);
  });

  it('sem maquininha (ou API antiga, sem o campo), nada a mais aparece', () => {
    expect(render(undefined).textContent).not.toContain('Maquininha:');
  });
});
