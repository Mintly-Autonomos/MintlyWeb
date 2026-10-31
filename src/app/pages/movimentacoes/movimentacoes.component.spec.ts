import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MovimentacoesComponent } from './movimentacoes.component';
import { MovimentacoesService, buildImportPreview } from '../../services/movimentacoes.service';
import type { ImportGridRow } from '../../services/movimentacoes.service';
import { ContasService } from '../../services/contas.service';
import { CategoriasService } from '../../services/categorias.service';

interface Internals {
  statusOpts: () => { value: string; label: string }[];
  statusFilter: (() => string) & { set(v: string): void };
  typeFilter: () => string;
  setTypeFilter(type: string): void;
  importRows: () => Row[];
  submitImport(): Promise<void>;
  confirmImportPreview(): void;
  setRowValue(index: number, text: string): void;
  padRowValue(index: number): void;
  closeImportPreview(): void;
  toggleRowIncluded(index: number, included: boolean): void;
  importFile: { set(f: File | null): void };
  fillBlank(field: string, raw: string): void;
  blankCount(field: string): number;
  updateRowField(i: number, field: string, value: unknown): void;
  form: () => { date: string };
  importCategoriesFor(row: Row): { name: string }[];
}
interface Row {
  value: number;
  valueText: string;
  notes: string | null;
  type: string | null;
  categoryName: string;
  accountName: string;
  paymentMethod: string | null;
  status: string | null;
  date: string;
  valid: boolean;
  included: boolean;
  error: string | null;
}

const category = (id: string, name: string, type: 'income' | 'expense') => ({
  id,
  name,
  type,
  active: true,
  subcategories: [],
});
const account = (id: string, name: string) => ({
  id,
  name,
  type: 'Bank',
  active: true,
  isDefault: false,
  balance: 0,
  predictedBalance: 0,
});

describe('MovimentacoesComponent', () => {
  let c: Internals;
  let fixture: ComponentFixture<MovimentacoesComponent>;
  let previewImport: ReturnType<typeof vi.fn>;
  let confirmImport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    previewImport = vi.fn();
    confirmImport = vi.fn().mockResolvedValue({ insertedCount: 1, items: [], failedRows: [] });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MovimentacoesService,
          useValue: {
            movements: signal([]),
            loading: signal(false),
            refresh: vi.fn().mockResolvedValue(undefined),
            previewImport,
            confirmImport: confirmImport,
          },
        },
        {
          provide: ContasService,
          useValue: {
            accounts: signal([account('a1', 'Keeta'), account('a2', 'Caixa')]),
            refresh: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CategoriasService,
          useValue: {
            categories: signal([
              category('c1', 'Aluguel', 'expense'),
              category('c2', 'Venda Delivery', 'income'),
              category('c3', 'Venda Balcão', 'income'),
            ]),
            refresh: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(MovimentacoesComponent);
    c = fixture.componentInstance as unknown as Internals;
  });

  /** Mesmas linhas da base do Keeta: categoria e formas escritas "do jeito do dono". */
  const keetaPreview = (rows = 3) =>
    buildImportPreview('base-receitas-keeta-outubro-2026.xlsx', [
      {
        row: 1,
        cells: [
          'Tipo',
          'Título',
          'Valor',
          'Data (AAAA-MM-DD)',
          'Categoria',
          'Conta',
          'Forma de pagamento',
          'Status',
          'Observações',
        ],
      },
      ...Array.from(
        { length: rows },
        (_, i): ImportGridRow => ({
          row: i + 2,
          cells: [
            'Receita',
            `Pedido ${i}`,
            125,
            '2026-10-29',
            'Venda delivery',
            'Keeta',
            ['Pix', 'Carteira digital', 'Cartão de crédito'][i % 3],
            'Recebido',
            '',
          ],
        }),
      ),
    ]);

  describe('revisão da importação: o que veio da planilha já vem preenchido', () => {
    beforeEach(async () => {
      previewImport.mockResolvedValue(keetaPreview());
      c.importFile.set(new File(['x'], 'base.xlsx'));
      await c.submitImport();
    });

    it('categoria, conta e forma de pagamento já vêm marcadas (com o nome exato do cadastro)', () => {
      const rows = c.importRows();
      expect(rows).toHaveLength(3);
      // "Venda delivery" da planilha -> "Venda Delivery" do cadastro (antes aparecia "Aluguel" na lista)
      expect(rows.every((r) => r.categoryName === 'Venda Delivery')).toBe(true);
      expect(rows.every((r) => r.accountName === 'Keeta')).toBe(true);
      expect(rows.map((r) => r.paymentMethod)).toEqual(['PIX', 'Carteira Digital', 'Crédito']);
      expect(rows.every((r) => r.valid && r.included)).toBe(true);
    });

    it('a lista de categorias de uma receita só oferece categorias de receita', () => {
      const names = c.importCategoriesFor(c.importRows()[0]).map((x) => x.name);
      expect(names).toEqual(['Venda Delivery', 'Venda Balcão']);
    });
  });

  describe('planilha sem algumas colunas: a pessoa completa na revisão', () => {
    const semCategoria = () =>
      buildImportPreview('x.xlsx', [
        { row: 1, cells: ['Tipo', 'Título', 'Valor', 'Data'] },
        { row: 2, cells: ['Receita', 'Pedido 1', 125, '2026-10-29'] },
        { row: 3, cells: ['Receita', 'Pedido 2', 135, '2026-10-28'] },
      ]);

    beforeEach(async () => {
      previewImport.mockResolvedValue(semCategoria());
      c.importFile.set(new File(['x'], 'base.xlsx'));
      await c.submitImport();
    });

    it('linhas ficam inválidas e sem seleção, sem derrubar o resto', () => {
      const rows = c.importRows();
      expect(rows.every((r) => !r.valid && !r.included)).toBe(true);
      expect(rows[0].error).toContain('falta a categoria');
      expect(rows[0].error).toContain('falta a conta');
      expect(rows[0].error).toContain('falta a forma de pagamento');
      expect(rows[0].error).toContain('falta o status');
      expect(rows[0].date).toBe('2026-10-29');
    });

    it('"preencher em branco" completa todas as linhas de uma vez e elas passam a valer', () => {
      expect(c.blankCount('categoryName')).toBe(2);
      c.fillBlank('categoryName', 'Venda Delivery');
      c.fillBlank('accountName', 'Keeta');
      c.fillBlank('paymentMethod', 'PIX');
      c.fillBlank('status', 'settled');
      const rows = c.importRows();
      expect(rows.every((r) => r.valid && r.included)).toBe(true);
      expect(rows.every((r) => r.status === 'received')).toBe(true);
      expect(c.blankCount('categoryName')).toBe(0);
    });

    it('preencher em branco NÃO mexe no que a pessoa já tinha escolhido', () => {
      c.updateRowField(0, 'accountName', 'Caixa');
      c.fillBlank('accountName', 'Keeta');
      expect(c.importRows()[0].accountName).toBe('Caixa');
      expect(c.importRows()[1].accountName).toBe('Keeta');
    });

    it('categoria de despesa não é aplicada em linha de receita', () => {
      c.fillBlank('categoryName', 'Aluguel');
      expect(c.importRows().every((r) => r.categoryName === '')).toBe(true);
    });

    it('corrigir uma linha à mão (um campo de cada vez) a deixa válida', () => {
      c.updateRowField(0, 'categoryName', 'Venda Balcão');
      c.updateRowField(0, 'accountName', 'Caixa');
      c.updateRowField(0, 'paymentMethod', 'Dinheiro');
      expect(c.importRows()[0].valid).toBe(false); // ainda falta o status
      c.updateRowField(0, 'status', 'received');
      expect(c.importRows()[0].valid).toBe(true);
      expect(c.importRows()[0].included).toBe(true);
    });
  });

  describe('planilha sem coluna de tipo', () => {
    it('a pessoa escolhe o tipo (ou preenche tudo de uma vez) e a categoria passa a ser validada', async () => {
      previewImport.mockResolvedValue(
        buildImportPreview('x.xlsx', [
          {
            row: 1,
            cells: [
              'Título',
              'Valor',
              'Data',
              'Categoria',
              'Conta',
              'Forma de pagamento',
              'Status',
            ],
          },
          {
            row: 2,
            cells: ['Pedido 1', 125, '2026-10-29', 'Venda delivery', 'Keeta', 'Pix', 'Recebido'],
          },
        ]),
      );
      c.importFile.set(new File(['x'], 'base.xlsx'));
      await c.submitImport();
      expect(c.importRows()[0].type).toBeNull();
      expect(c.importRows()[0].valid).toBe(false);
      c.fillBlank('type', 'income');
      expect(c.importRows()[0].valid).toBe(true);
      expect(c.importRows()[0].categoryName).toBe('Venda Delivery');
    });
  });

  describe('título muito longo', () => {
    it('a linha fica inválida e volta a valer quando a pessoa encurta', async () => {
      const longo = 'x'.repeat(125);
      previewImport.mockResolvedValue(
        buildImportPreview('x.xlsx', [
          {
            row: 1,
            cells: [
              'Tipo',
              'Título',
              'Valor',
              'Data',
              'Categoria',
              'Conta',
              'Forma de pagamento',
              'Status',
            ],
          },
          {
            row: 2,
            cells: [
              'Receita',
              longo,
              135,
              '2026-10-29',
              'Venda Delivery',
              'Keeta',
              'Pix',
              'Recebido',
            ],
          },
        ]),
      );
      c.importFile.set(new File(['x'], 'base.xlsx'));
      await c.submitImport();
      expect(c.importRows()[0].valid).toBe(false);
      expect(c.importRows()[0].error).toContain('passa de 120 caracteres');
      c.updateRowField(0, 'title', 'x'.repeat(100));
      expect(c.importRows()[0].valid).toBe(true);
      expect(c.importRows()[0].included).toBe(true);
    });
  });

  describe('telas da importação em massa mostram o ERRO de cada linha', () => {
    const text = (el: ParentNode, selector: string) =>
      Array.from(el.querySelectorAll(selector)).map((e) =>
        (e.textContent ?? '').split(/\s+/).join(' ').trim(),
      );

    /** Uma linha boa, uma com título de 125 caracteres e uma sem categoria. */
    const preview = () =>
      buildImportPreview('x.xlsx', [
        {
          row: 1,
          cells: [
            'Tipo',
            'Título',
            'Valor',
            'Data',
            'Categoria',
            'Conta',
            'Forma de pagamento',
            'Status',
          ],
        },
        {
          row: 2,
          cells: [
            'Receita',
            'Pedido ok',
            125,
            '2026-10-29',
            'Venda Delivery',
            'Keeta',
            'Pix',
            'Recebido',
          ],
        },
        {
          row: 3,
          cells: [
            'Receita',
            'x'.repeat(125),
            135,
            '2026-10-29',
            'Venda Delivery',
            'Keeta',
            'Pix',
            'Recebido',
          ],
        },
        {
          row: 4,
          cells: ['Receita', 'Sem categoria', 135, '2026-10-29', '', 'Keeta', 'Pix', 'Recebido'],
        },
      ]);

    beforeEach(async () => {
      previewImport.mockResolvedValue(preview());
      c.importFile.set(new File(['x'], 'base.xlsx'));
      await c.submitImport();
      fixture.detectChanges();
    });

    it('na revisão: cada linha com erro mostra o motivo escrito, sem depender de passar o mouse', () => {
      const root = fixture.nativeElement as HTMLElement;
      const messages = text(root, '[data-testid="erro-linha"]');
      expect(messages).toHaveLength(2);
      expect(messages[0]).toBe(
        'título passa de 120 caracteres (tem 125): encurte e coloque os detalhes em Observações',
      );
      expect(messages[1]).toBe('falta a categoria');
    });

    it('na revisão: a linha válida não tem mensagem de erro', () => {
      const root = fixture.nativeElement as HTMLElement;
      expect(text(root, '[data-testid="erro-linha"]').join(' ')).not.toContain('Pedido ok');
      expect(root.querySelectorAll('[data-testid="erro-linha"]')).toHaveLength(2);
    });

    it('corrigir o campo faz a mensagem sumir', () => {
      c.updateRowField(1, 'title', 'x'.repeat(100));
      fixture.detectChanges();
      const messages = text(fixture.nativeElement as HTMLElement, '[data-testid="erro-linha"]');
      expect(messages).toEqual(['falta a categoria']);
    });

    it('no aviso de linhas que ficam de fora: o motivo de cada uma e a dica de como corrigir', () => {
      c.confirmImportPreview();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const reasons = text(root, '[data-testid="motivo-excluida"]');
      expect(reasons).toHaveLength(2);
      expect(reasons[0]).toBe(
        'título passa de 120 caracteres (tem 125): encurte e coloque os detalhes em Observações',
      );
      expect(reasons[1]).toBe('falta a categoria');
      expect(root.textContent).toContain('clique em Revisar');
    });

    it('no aviso: linha desmarcada à mão diz que foi desmarcada, e não mostra a dica de erro', async () => {
      c.updateRowField(1, 'title', 'x'.repeat(100));
      c.updateRowField(2, 'categoryName', 'Venda Balcão');
      (c as unknown as { toggleRowIncluded(i: number, v: boolean): void }).toggleRowIncluded(
        0,
        false,
      );
      c.confirmImportPreview();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(text(root, '[data-testid="motivo-excluida"]')).toEqual(['Você desmarcou esta linha.']);
      expect(root.textContent).not.toContain('clique em Revisar');
    });
  });

  describe('observações na revisão: recolhidas num botão, abrem uma linha extra', () => {
    const longTitle = 'Pedido 8547 - ' + 'x'.repeat(111); // 125 caracteres
    const header = [
      'Tipo',
      'Título',
      'Valor',
      'Data',
      'Categoria',
      'Conta',
      'Forma de pagamento',
      'Status',
      'Observações',
    ];
    const root = () => fixture.nativeElement as HTMLElement;
    const button = () => root().querySelector<HTMLButtonElement>('[data-testid="btn-obs"]')!;
    const textarea = () =>
      root().querySelector<HTMLTextAreaElement>('textarea[data-testid="obs-linha"]');
    const flat = (e: Element) => (e.textContent ?? '').split(/\s+/).join(' ').trim();

    const load = async (obs = '', title = longTitle) => {
      previewImport.mockResolvedValue(
        buildImportPreview('x.xlsx', [
          { row: 1, cells: header },
          {
            row: 2,
            cells: [
              'Receita',
              title,
              135,
              '2026-10-29',
              'Venda Delivery',
              'Keeta',
              'Pix',
              'Recebido',
              obs,
            ],
          },
        ]),
      );
      c.importFile.set(new File(['x'], 'base.xlsx'));
      await c.submitImport();
      fixture.detectChanges();
    };

    it('a tabela tem uma coluna estreita "Obs." com um botão por linha, e o campo começa recolhido', async () => {
      await load();
      const headers = Array.from(root().querySelectorAll('thead th')).map((th) => flat(th));
      expect(headers).toContain('Obs.');
      expect(root().querySelectorAll('[data-testid="btn-obs"]')).toHaveLength(1);
      expect(textarea()).toBeNull();
      expect(button().getAttribute('aria-expanded')).toBe('false');
    });

    it('apertar o botão abre uma linha extra com o campo (e apertar de novo recolhe)', async () => {
      await load();
      button().click();
      fixture.detectChanges();
      expect(textarea()).not.toBeNull();
      expect(root().querySelector('[data-testid="linha-obs"]')).not.toBeNull();
      expect(button().getAttribute('aria-expanded')).toBe('true');
      button().click();
      fixture.detectChanges();
      expect(textarea()).toBeNull();
    });

    it('o texto que a planilha já trazia aparece no campo e o botão avisa que há observações', async () => {
      await load('Curry + batata', 'Pedido 1');
      expect(button().title).toBe('Observações: Curry + batata');
      expect(button().querySelector('span.rounded-full')).not.toBeNull();
      button().click();
      fixture.detectChanges();
      expect(textarea()!.value).toBe('Curry + batata');
    });

    it('sem observações o botão não tem o indicador', async () => {
      await load('', 'Pedido 1');
      expect(button().title).toBe('Adicionar observações');
      expect(button().querySelector('span.rounded-full')).toBeNull();
    });

    it('digitar no campo atualiza a linha; apagar volta a null', async () => {
      await load('', 'Pedido 1');
      button().click();
      fixture.detectChanges();
      textarea()!.value = 'detalhes';
      textarea()!.dispatchEvent(new Event('input', { bubbles: true }));
      expect(c.importRows()[0].notes).toBe('detalhes');
      textarea()!.value = '';
      textarea()!.dispatchEvent(new Event('input', { bubbles: true }));
      expect(c.importRows()[0].notes).toBeNull();
    });

    it('título longo: encurta o título, coloca os detalhes nas Observações e eles seguem para a API', async () => {
      await load();
      expect(c.importRows()[0].valid).toBe(false);
      expect(c.importRows()[0].error).toContain('coloque os detalhes em Observações');

      button().click();
      fixture.detectChanges();
      textarea()!.value = 'Curry + Batata Rústica; Soyu e alho + Batata Rústica';
      textarea()!.dispatchEvent(new Event('input', { bubbles: true }));
      c.updateRowField(0, 'title', 'Pedido 8547');

      expect(c.importRows()[0].valid).toBe(true);
      expect(c.importRows()[0].included).toBe(true);
      c.confirmImportPreview();
      await fixture.whenStable();
      expect(confirmImport).toHaveBeenCalledTimes(1);
      expect(confirmImport.mock.calls[0][0][0]).toMatchObject({
        title: 'Pedido 8547',
        notes: 'Curry + Batata Rústica; Soyu e alho + Batata Rústica',
      });
    });

    it('observações acima de 500: o campo abre sozinho, com o erro escrito e o contador', async () => {
      await load('', 'Pedido');
      c.updateRowField(0, 'notes', 'y'.repeat(501));
      fixture.detectChanges();
      expect(c.importRows()[0].valid).toBe(false);
      expect(textarea()).not.toBeNull(); // abriu à força: o erro precisa de onde corrigir
      const msgs = Array.from(root().querySelectorAll('[data-testid="erro-linha"]')).map(flat);
      expect(msgs).toEqual(['observações passam de 500 caracteres (têm 501): encurte']);
      expect(flat(root().querySelector('[data-testid="linha-obs"]')!)).toContain('501/500');
    });

    it('fechar a revisão recolhe todos os campos (a próxima importação começa recolhida)', async () => {
      await load('', 'Pedido 1');
      button().click();
      fixture.detectChanges();
      c.closeImportPreview();
      await load('', 'Pedido 2');
      expect(textarea()).toBeNull();
    });
  });

  describe('campo Valor da revisão: sempre com ,00', () => {
    const root = () => fixture.nativeElement as HTMLElement;
    const field = () => root().querySelector<HTMLInputElement>('input[data-testid="valor-linha"]')!;
    const load = async (value: number | string) => {
      previewImport.mockResolvedValue(
        buildImportPreview('x.xlsx', [
          {
            row: 1,
            cells: [
              'Tipo',
              'Título',
              'Valor',
              'Data',
              'Categoria',
              'Conta',
              'Forma de pagamento',
              'Status',
            ],
          },
          {
            row: 2,
            cells: [
              'Receita',
              'Pedido 1',
              value,
              '2026-10-29',
              'Venda Delivery',
              'Keeta',
              'Pix',
              'Recebido',
            ],
          },
        ]),
      );
      c.importFile.set(new File(['x'], 'base.xlsx'));
      await c.submitImport();
      fixture.detectChanges();
    };

    it('o valor lido da planilha já aparece com duas casas (125 -> 125,00)', async () => {
      await load(125);
      expect(field().value).toBe('125,00');
    });

    it('valor com milhar e centavos aparece formatado', async () => {
      await load(1234.5);
      expect(field().value).toBe('1.234,50');
    });

    it('digitar aplica a máscara, o número da linha acompanha e ao sair fecha com ,00', async () => {
      await load(125);
      field().focus();
      field().value = '14500';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      expect(field().value).toBe('14.500');
      expect(c.importRows()[0].value).toBe(14500);

      field().dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(field().value).toBe('14.500,00');
      expect(c.importRows()[0].valueText).toBe('14.500,00');
      expect(c.importRows()[0].value).toBe(14500);
    });

    it('centavos: 12,5 ao sair vira 12,50 (valor 12.5)', async () => {
      await load(125);
      field().value = '12,5';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      field().dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(field().value).toBe('12,50');
      expect(c.importRows()[0].value).toBe(12.5);
    });

    it('apagar o campo vira erro "valor deve ser maior que zero" e continua vazio ao sair', async () => {
      await load(125);
      field().value = '';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      field().dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(field().value).toBe('');
      expect(c.importRows()[0].value).toBe(0);
      expect(c.importRows()[0].valid).toBe(false);
      expect(c.importRows()[0].error).toContain('valor deve ser maior que zero');
    });

    it('o valor digitado é o que vai para a API', async () => {
      await load(125);
      field().value = '99,9';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      field().dispatchEvent(new Event('blur'));
      c.confirmImportPreview();
      await fixture.whenStable();
      expect(confirmImport.mock.calls[0][0][0].value).toBe(99.9);
    });
  });

  describe('data de hoje no formulário', () => {
    it('usa o dia de quem está usando, não o do UTC', () => {
      const hoje = new Date();
      const esperado = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      expect(c.form().date).toBe(esperado);
    });
  });

  describe('filtro de status só mostra o que existe no tipo escolhido', () => {
    const values = () => c.statusOpts().map((o) => o.value);

    it('sem tipo: todos', () => {
      expect(values()).toEqual(['all', 'received', 'paid', 'pending', 'cancelled']);
    });

    it('receita: sem "Pago"; despesa: sem "Recebido"', () => {
      c.setTypeFilter('income');
      expect(values()).toEqual(['all', 'received', 'pending', 'cancelled']);
      c.setTypeFilter('expense');
      expect(values()).toEqual(['all', 'paid', 'pending', 'cancelled']);
    });

    it('trocar o tipo desfaz um status que deixou de existir nele', () => {
      c.statusFilter.set('paid');
      c.setTypeFilter('income');
      expect(c.statusFilter()).toBe('all');
      c.statusFilter.set('received');
      c.setTypeFilter('expense');
      expect(c.statusFilter()).toBe('all');
    });

    it('trocar o tipo mantém um status que continua valendo', () => {
      c.statusFilter.set('pending');
      c.setTypeFilter('income');
      expect(c.statusFilter()).toBe('pending');
    });
  });
});
