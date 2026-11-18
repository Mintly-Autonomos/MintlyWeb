import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

// Entrada nova em conta com repasse (cartão, iFood) nasce "Pendente": o dinheiro só cai depois do prazo.

describe('Movimentações: status inicial pelo repasse da conta', () => {
  function montar(contaPadrao: 'caixa' | 'stone' = 'caixa') {
    const vazio = { refresh: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: MovimentacoesService,
          useValue: {
            ...vazio,
            movements: signal([]),
            loading: signal(false),
            loaded: signal(true),
          },
        },
        {
          provide: ContasService,
          useValue: {
            ...vazio,
            accounts: signal([
              {
                id: 'cx',
                name: 'Caixa',
                type: 'Cash',
                active: true,
                isDefault: contaPadrao === 'caixa',
              },
              {
                id: 'st',
                name: 'Stone',
                type: 'Financial Platform',
                active: true,
                taxPct: 2.5,
                settlementDays: 30,
                isDefault: contaPadrao === 'stone',
              },
              {
                id: 'px',
                name: 'Pix na hora',
                type: 'Financial Platform',
                active: true,
                settlementDays: 0,
              },
            ]),
          },
        },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        { provide: CategoriasService, useValue: { ...vazio, categories: signal([]) } },
      ],
    });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      form: WritableSignal<{ status: string; accountId: string | null; type: string }>;
      openCreate(type?: 'income' | 'expense'): void;
      openEdit(m: unknown): void;
      setFormField(k: string, v: unknown): void;
      setType(t: 'income' | 'expense'): void;
    };
  }

  it('entrada nova: conta sem repasse fica "Recebido"; trocar para a Stone (30 dias) vira "Pendente" e volta', () => {
    const c = montar();
    c.openCreate('income');
    expect(c.form().status).toBe('received');
    c.setFormField('accountId', 'st');
    expect(c.form().status).toBe('pending');
    c.setFormField('accountId', 'cx');
    expect(c.form().status).toBe('received');
    // Repasse no mesmo dia não é prazo.
    c.setFormField('accountId', 'px');
    expect(c.form().status).toBe('received');
  });

  it('a conta padrão já com repasse abre o formulário como "Pendente"', () => {
    const c = montar('stone');
    c.openCreate('income');
    expect(c.form().accountId).toBe('st');
    expect(c.form().status).toBe('pending');
  });

  it('se a pessoa escolheu o status, trocar a conta não mexe mais nele', () => {
    const c = montar();
    c.openCreate('income');
    c.setFormField('status', 'received');
    c.setFormField('accountId', 'st');
    expect(c.form().status).toBe('received');
  });

  it('saída continua nascendo "Pago", mesmo na conta com repasse', () => {
    const c = montar('stone');
    c.openCreate('expense');
    expect(c.form().status).toBe('paid');
    c.setType('income');
    expect(c.form().status).toBe('pending');
  });

  it('editar um lançamento não troca o status dele', () => {
    const c = montar();
    c.openEdit({
      id: 'm1',
      type: 'income',
      title: 'Venda',
      value: 100,
      date: '2026-11-10',
      categoryId: null,
      accountId: 'cx',
      paymentMethod: 'PIX',
      status: 'received',
    });
    c.setFormField('accountId', 'st');
    expect(c.form().status).toBe('received');
  });
});
