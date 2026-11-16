import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformKind } from 'mintly-lib';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

describe('Movimentações: prévia da taxa pela forma de pagamento (relatório S3.3)', () => {
  function montar() {
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
                id: 'st',
                name: 'Stone',
                type: 'Financial Platform',
                active: true,
                taxPct: 2.5,
                platformKind: PlatformKind.CardMachine,
                feeByMethod: { debit: 1, credit: 3 },
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
      form: WritableSignal<{
        accountId: string;
        value: string;
        paymentMethod: string;
        type: string;
      }>;
      platformFee: number;
      netValue: number;
    };
  }

  it('crédito usa a taxa do crédito; Pix (sem taxa própria) usa a padrão', () => {
    const c = montar();
    c.form.update((f) => ({
      ...f,
      type: 'income',
      accountId: 'st',
      value: '1000',
      paymentMethod: 'Crédito',
    }));
    expect(c.platformFee).toBe(30);
    expect(c.netValue).toBe(970);
    c.form.update((f) => ({ ...f, paymentMethod: 'PIX' }));
    expect(c.platformFee).toBe(25);
    c.form.update((f) => ({ ...f, paymentMethod: '' }));
    expect(c.platformFee).toBe(25);
  });
});
