import { signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { CategoriasService } from '../../services/categorias.service';
import { ContasService } from '../../services/contas.service';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { MovimentacoesComponent } from './movimentacoes.component';

const mov = (id: string, date: string, status = 'received') => ({
  id,
  title: `Lançamento ${id}`,
  type: 'income',
  status,
  value: 10,
  date,
  categoryId: 'c-venda',
  accountId: 'a-caixa',
});

describe('Movimentações: futuros escondidos, lista abre em hoje (relatório U.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  function montar(movs: ReturnType<typeof mov>[]) {
    const vazio = { refresh: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        // O componente consulta o perfil (problemas 23/11): sem o falso, o AuthService de verdade pede a URL da API.
        { provide: AuthService, useValue: { podeMudarCadastros: () => true, meuId: () => null } },
        provideRouter([]),
        {
          provide: MovimentacoesService,
          useValue: {
            ...vazio,
            movements: signal(movs),
            loading: signal(false),
            loaded: signal(true),
          },
        },
        {
          provide: ContasService,
          useValue: {
            ...vazio,
            accounts: signal([{ id: 'a-caixa', name: 'Caixa', active: true }]),
          },
        },
        { provide: CardapioService, useValue: { ...vazio, pratos: signal([]) } },
        {
          provide: CategoriasService,
          useValue: {
            ...vazio,
            categories: signal([{ id: 'c-venda', name: 'Venda Balcão', type: 'income' }]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MovimentacoesComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const linhas = () =>
      [...root.querySelectorAll('tbody tr')]
        .map((tr) => (tr.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const q = (id: string) => root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    return { fixture, root, linhas, q };
  }

  const movs = [
    mov('dez', '2026-12-20', 'pending'),
    mov('amanha', '2026-11-16', 'pending'),
    mov('hoje', '2026-11-15'),
    mov('ontem', '2026-11-14'),
  ];

  it('em "Todos", a lista começa em hoje e a faixa conta os futuros e diz o próximo', () => {
    const { linhas, q } = montar(movs);
    const l = linhas();
    expect(l[0]).toContain('Lançamento hoje');
    expect(l.some((t) => t.includes('Lançamento dez'))).toBe(false);
    expect(q('faixa-futuros')!.textContent!.replace(/\s+/g, ' ')).toContain(
      '2 lançamentos futuros · o próximo em 16/11',
    );
    expect(q('contagem-lista')!.textContent).toContain('Mostrando 2 de 2');
  });

  it('"Mostrar futuros" põe os futuros no topo com o divisor "Hoje" antes de hoje', () => {
    const { fixture, linhas, q } = montar(movs);
    q('alternar-futuros')!.click();
    fixture.detectChanges();
    const l = linhas();
    expect(l[0]).toContain('Lançamento dez');
    expect(l[1]).toContain('Lançamento amanha');
    expect(l[2]).toBe('Hoje · 15/11/2026');
    expect(l[3]).toContain('Lançamento hoje');
    expect(q('alternar-futuros')!.textContent).toContain('Esconder futuros');
    expect(q('contagem-lista')!.textContent).toContain('Mostrando 4 de 4');
  });

  it('sem futuros, nada de faixa nem divisor', () => {
    const { q } = montar([mov('hoje', '2026-11-15'), mov('ontem', '2026-11-14')]);
    expect(q('faixa-futuros')).toBeNull();
    expect(q('divisor-hoje')).toBeNull();
  });

  it('só futuros: a faixa aparece e a tabela explica que não há nada até hoje', () => {
    const { q } = montar([mov('dez', '2026-12-20', 'pending')]);
    expect(q('faixa-futuros')).not.toBeNull();
    expect(q('nada-ate-hoje')).not.toBeNull();
  });
});
