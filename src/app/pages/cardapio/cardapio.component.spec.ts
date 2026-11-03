import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CardapioComponent, DESTAQUE_MS } from './cardapio.component';
import { CardapioService, Prato } from '../../services/cardapio.service';
import { ToastService } from '../../shared/toast.service';

const agora = new Date().toISOString();

const prato = (over: Partial<Prato>): Prato => ({
  id: 'p1',
  name: 'Frango Original',
  category: 'Frango',
  price: 20,
  cost: 12,
  soldPerMonth: 30,
  active: true,
  priceUpdatedAt: agora,
  priceReviewedAt: agora,
  ...over,
});

/** O que o teste mexe direto, no padrão do spec de Movimentações. */
interface Internals {
  f: { set(v: { nome: string; categoria: string; preco: string; custo: string }): void };
  precoEditado: { set(v: string): void };
  precoEditandoId(): string | null;
  adicionar(): Promise<void>;
  iniciarEdicao(p: Prato): void;
  salvarEdicao(p: Prato): Promise<void>;
  iniciarPreco(p: Prato): void;
  salvarPreco(p: Prato): Promise<void>;
  alternarAtivo(p: Prato): Promise<void>;
}

describe('CardapioComponent', () => {
  function render(pratos: Prato[], query: Record<string, string> = {}) {
    const svc = {
      pratos: signal(pratos),
      categorias: signal(['Frango']),
      loading: signal(false),
      refresh: vi.fn(() => Promise.resolve()),
      create: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      changePrice: vi.fn(() => Promise.resolve()),
      keepPrice: vi.fn(() => Promise.resolve()),
      setActive: vi.fn(() => Promise.resolve()),
      errorMessage: (e: unknown) => String(e),
    };
    const toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CardapioService, useValue: svc },
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(CardapioComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    const c = fixture.componentInstance as unknown as Internals;
    return { fixture, root, text, svc, toast, c };
  }

  it('carrega os pratos ao abrir e lista nome, categoria, preço e custo', () => {
    const { svc, text } = render([prato({})]);
    expect(svc.refresh).toHaveBeenCalled();
    expect(text()).toContain('Frango Original');
    expect(text()).toContain('R$ 20,00');
    expect(text()).toContain('R$ 12,00');
  });

  it('mostra a margem só em porcentagem, e traço enquanto não há custo', () => {
    const { root, text } = render([
      prato({}),
      prato({ id: 'p2', name: 'Suco', cost: 0, price: 8, category: null }),
    ]);
    // 20 de preço e 12 de custo: sobram 40% do preço.
    expect(text()).toContain('40%');
    expect(text()).not.toContain('R$ 8,00 (40%)');
    const linhaFrango = Array.from(root.querySelectorAll('tr')).find((r) =>
      r.textContent?.includes('Frango Original'),
    );
    expect(linhaFrango?.textContent).not.toMatch(/R\$ 8,00/);
    const linhaSuco = Array.from(root.querySelectorAll('tr')).find((r) =>
      r.textContent?.includes('Suco'),
    );
    expect(linhaSuco?.textContent).not.toContain('%');
  });

  it('a busca filtra por nome ou categoria, sem acento, e diz quantos aparecem', () => {
    const { fixture, root, text } = render([
      prato({ id: 'a', name: 'Frango Original', category: 'Frango' }),
      prato({ id: 'b', name: 'Pão de queijo', category: 'Salgados' }),
    ]);
    const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'pao';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(text()).toContain('Pão de queijo');
    expect(text()).not.toContain('Frango Original');
    expect(text()).toContain('1 de 2 pratos');

    input.value = 'xyz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(text()).toContain('Nenhum prato encontrado');
  });

  it('cadastra um prato novo com preço e custo', async () => {
    const { c, svc, toast } = render([prato({})]);
    c.f.set({
      nome: '  Batata Rústica ',
      categoria: 'Acompanhamentos',
      preco: '12,50',
      custo: '4',
    });
    await c.adicionar();
    expect(svc.create).toHaveBeenCalledWith({
      name: 'Batata Rústica',
      price: 12.5,
      category: 'Acompanhamentos',
      cost: 4,
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('não cadastra sem nome ou sem preço', async () => {
    const { c, svc, toast } = render([]);
    c.f.set({ nome: '', categoria: '', preco: '10', custo: '' });
    await c.adicionar();
    c.f.set({ nome: 'Suco', categoria: '', preco: '', custo: '' });
    await c.adicionar();
    expect(svc.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it('editar: grava nome, categoria e custo; o preço só pelo endpoint próprio, e só se mudou', async () => {
    const p = prato({});
    const { c, svc } = render([p]);
    c.iniciarEdicao(p);
    c.f.set({ nome: 'Frango Crocante', categoria: 'Frango', preco: '20,00', custo: '13' });
    await c.salvarEdicao(p);
    expect(svc.update).toHaveBeenCalledWith('p1', {
      name: 'Frango Crocante',
      category: 'Frango',
      cost: 13,
    });
    expect(svc.changePrice).not.toHaveBeenCalled();

    c.iniciarEdicao(p);
    c.f.set({ nome: 'Frango Crocante', categoria: 'Frango', preco: '22,00', custo: '13' });
    await c.salvarEdicao(p);
    expect(svc.changePrice).toHaveBeenCalledWith('p1', 22);
  });

  it('mudar preço grava pelo endpoint de preço', async () => {
    const p = prato({});
    const { c, svc } = render([p]);
    c.iniciarPreco(p);
    c.precoEditado.set('25,90');
    await c.salvarPreco(p);
    expect(svc.changePrice).toHaveBeenCalledWith('p1', 25.9);
  });

  it('inativar chama o serviço com o contrário do estado atual', async () => {
    const p = prato({});
    const { c, svc } = render([p]);
    await c.alternarAtivo(p);
    expect(svc.setActive).toHaveBeenCalledWith('p1', false);
  });

  it('cardápio vazio mostra o convite para cadastrar, sem tabela', () => {
    const { root, text } = render([]);
    expect(text()).toContain('Seu cardápio está vazio');
    expect(root.querySelector('table')).toBeNull();
  });

  describe('destaque do prato vindo do sino ou do simulador', () => {
    // O jsdom não implementa a rolagem; o app rola até o prato destacado.
    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => vi.useRealTimers());

    const linha = (root: HTMLElement, id: string) =>
      root.querySelector<HTMLElement>('#cardapio-item-' + id)!;

    it('marca o prato do link e tira a marca depois de alguns segundos', () => {
      vi.useFakeTimers();
      const { fixture, root } = render([prato({ id: 'a' }), prato({ id: 'b', name: 'Suco' })], {
        item: 'a',
      });
      fixture.detectChanges();
      expect(linha(root, 'a').className).toContain('bg-warning/10');
      expect(linha(root, 'b').className).not.toContain('bg-warning/10');

      vi.advanceTimersByTime(DESTAQUE_MS + 10);
      fixture.detectChanges();
      expect(linha(root, 'a').className).not.toContain('bg-warning/10');
      expect(linha(root, 'a').className).toContain('outline-transparent');
    });

    it('sem prato no link, nenhum fica marcado', () => {
      const { root } = render([prato({ id: 'a' })]);
      expect(linha(root, 'a').className).not.toContain('bg-warning/10');
    });

    it('ao sair da tela cancela os timers pendentes', () => {
      vi.useFakeTimers();
      const { fixture } = render([prato({ id: 'a' })], { item: 'a' });
      fixture.destroy();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('preço vindo do simulador (Previsões)', () => {
    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    const campoPreco = (root: HTMLElement) =>
      root.querySelector<HTMLInputElement>('input[aria-label^="Novo preço de"]');

    it('abre "Mudar preço" já com o valor do simulador, é só confirmar', async () => {
      const { fixture, root, c, svc, text } = render([prato({ id: 'a', price: 20 })], {
        item: 'a',
        preco: '22.5',
      });
      fixture.detectChanges();
      expect(c.precoEditandoId()).toBe('a');
      expect(campoPreco(root)?.value).toBe('22,50');
      expect(root.querySelector('[data-testid=preco-do-simulador]')).not.toBeNull();
      expect(text()).toContain('confirme em Salvar');
      expect(svc.changePrice).not.toHaveBeenCalled();

      await c.salvarPreco(prato({ id: 'a', price: 20 }));
      expect(svc.changePrice).toHaveBeenCalledWith('a', 22.5);
    });

    it('sem preço no link (vindo do sino), só destaca: não abre o editor', () => {
      const { fixture, root, c } = render([prato({ id: 'a' })], { item: 'a' });
      fixture.detectChanges();
      expect(c.precoEditandoId()).toBeNull();
      expect(campoPreco(root)).toBeNull();
    });

    it('preço igual ao atual não abre o editor (não há o que confirmar)', () => {
      const { fixture, c } = render([prato({ id: 'a', price: 20 })], { item: 'a', preco: '20' });
      fixture.detectChanges();
      expect(c.precoEditandoId()).toBeNull();
    });

    it.each(['abc', '', '-5'])('preço inválido "%s" é ignorado', (preco) => {
      const { fixture, c } = render([prato({ id: 'a', price: 20 })], { item: 'a', preco });
      fixture.detectChanges();
      expect(c.precoEditandoId()).toBeNull();
    });

    it('prato inativo não abre o editor de preço', () => {
      const { fixture, c } = render([prato({ id: 'a', active: false })], {
        item: 'a',
        preco: '30',
      });
      fixture.detectChanges();
      expect(c.precoEditandoId()).toBeNull();
    });
  });

  it('traz um link para a análise em Previsões, que só sugere', () => {
    const { root } = render([prato({})]);
    const link = Array.from(root.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('análise do cardápio'),
    );
    expect(link?.getAttribute('href')).toContain('/previsoes');
  });
});
