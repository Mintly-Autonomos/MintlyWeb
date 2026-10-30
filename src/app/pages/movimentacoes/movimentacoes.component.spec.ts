import { TestBed } from '@angular/core/testing';
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
  importFile: { set(f: File | null): void };
  fillBlank(field: string, raw: string): void;
  blankCount(field: string): number;
  updateRowField(i: number, field: string, value: unknown): void;
  form: () => { date: string };
  importCategoriesFor(row: Row): { name: string }[];
}
interface Row {
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
  let previewImport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    previewImport = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MovimentacoesService,
          useValue: {
            movements: signal([]),
            loading: signal(false),
            refresh: vi.fn().mockResolvedValue(undefined),
            previewImport,
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
    c = TestBed.createComponent(MovimentacoesComponent).componentInstance as unknown as Internals;
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
