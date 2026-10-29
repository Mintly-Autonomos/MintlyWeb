import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Workbook } from 'exceljs';
import { IMPORT_MOVEMENTS_MAX_ROWS } from 'mintly-lib';
import {
  MovimentacoesService,
  ImportMovementItem,
  normalizeDate,
  parseNumberBR,
} from './movimentacoes.service';

type Linha = (string | number | Date)[];

// A lib lê a URL da API ao instanciar os clients (no app, o main.ts define antes do bootstrap).
declare const process: { env: Record<string, string | undefined> };
beforeAll(() => {
  process.env['BACK_END_URL'] = 'http://api.test';
});

async function planilha(linhas: Linha[]): Promise<File> {
  const wb = new Workbook();
  const sheet = wb.addWorksheet('Movimentações');
  sheet.addRow([
    'Tipo',
    'Título',
    'Valor',
    'Data (AAAA-MM-DD)',
    'Categoria',
    'Conta',
    'Forma de pagamento',
    'Status',
    'Observações',
  ]);
  linhas.forEach((l) => sheet.addRow(l));
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], 'import.xlsx');
}

describe('Importar em massa — leitura da planilha', () => {
  let svc: MovimentacoesService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    svc = TestBed.inject(MovimentacoesService);
  });

  it('lê uma linha válida (data como célula de data do Excel)', async () => {
    const file = await planilha([
      [
        'receita',
        'Venda balcão',
        184.5,
        new Date(Date.UTC(2026, 9, 28)),
        'Venda Balcão',
        'Caixa',
        'PIX',
        'Recebido',
        'obs',
      ],
    ]);
    const preview = await svc.previewImport(file);
    expect(preview.totalRows).toBe(1);
    expect(preview.validRows).toBe(1);
    expect(preview.items[0]).toMatchObject({
      type: 'income',
      title: 'Venda balcão',
      value: 184.5,
      date: '2026-10-28',
      categoryName: 'Venda Balcão',
      accountName: 'Caixa',
      paymentMethod: 'PIX',
      status: 'received',
    });
  });

  it('data digitada como texto no formato brasileiro (28/10/2026) vira AAAA-MM-DD', async () => {
    const file = await planilha([
      ['receita', 'Venda', 10, '28/10/2026', 'Venda Balcão', 'Caixa', 'PIX', 'Recebido'],
    ]);
    const { items } = await svc.previewImport(file);
    expect(items[0].date).toBe('2026-10-28');
    expect(items[0].valid).toBe(true);
  });

  it('data digitada como texto em ISO continua valendo', async () => {
    const file = await planilha([
      ['despesa', 'Gás', 90, '2026-10-05', 'Gás', 'Caixa', 'Dinheiro', 'Pago'],
    ]);
    const { items } = await svc.previewImport(file);
    expect(items[0].date).toBe('2026-10-05');
  });

  it('data que não dá para entender é recusada na prévia, com motivo', async () => {
    const file = await planilha([
      ['receita', 'Venda', 10, 'ontem', 'Venda Balcão', 'Caixa', 'PIX', 'Recebido'],
      ['receita', 'Venda', 10, '31/02/2026', 'Venda Balcão', 'Caixa', 'PIX', 'Recebido'],
    ]);
    const { items } = await svc.previewImport(file);
    expect(items.every((i) => !i.valid)).toBe(true);
    expect(items[0].error).toMatch(/data/i);
    expect(items[1].error).toMatch(/data/i);
  });

  it('valor com vírgula decimal e tipo/status em maiúsculas', async () => {
    const file = await planilha([
      [
        'Despesa',
        'Embalagens',
        '1.234,50',
        '2026-10-05',
        'Embalagens',
        'Caixa',
        'Débito',
        'PENDENTE',
      ],
    ]);
    const { items } = await svc.previewImport(file);
    expect(items[0].type).toBe('expense');
    expect(items[0].value).toBe(1234.5);
    expect(items[0].status).toBe('pending');
  });

  it('recusa CSV e arquivo que não é planilha, com mensagem em português', async () => {
    await expect(svc.previewImport(new File(['a,b'], 'vendas.csv'))).rejects.toThrow(/\.xlsx/);
    await expect(svc.previewImport(new File(['não sou um zip'], 'quebrado.xlsx'))).rejects.toThrow(
      /\.xlsx/,
    );
  });

  it('linhas vazias são ignoradas e erros de formato aparecem por linha', async () => {
    const file = await planilha([
      ['', '', '', '', '', ''],
      ['investimento', '', 0, '', '', ''],
    ]);
    const preview = await svc.previewImport(file);
    expect(preview.totalRows).toBe(1);
    expect(preview.items[0].valid).toBe(false);
    expect(preview.items[0].error).toContain('tipo');
  });
});

describe('Importar em massa — gravação', () => {
  let svc: MovimentacoesService;
  let importMovements: ReturnType<typeof vi.fn>;

  const item = (over: Partial<ImportMovementItem> = {}): ImportMovementItem => ({
    row: 2,
    type: 'income',
    title: 'Venda',
    value: 10,
    date: '2026-10-28',
    categoryName: 'Venda Balcão',
    accountName: 'Caixa',
    paymentMethod: 'PIX',
    status: 'received',
    notes: null,
    valid: true,
    error: null,
    ...over,
  });

  /** A API de mentira grava todas as linhas, a menos que o teste diga o contrário. */
  const created = (row: { row: number; title: string }) => ({
    row: row.row,
    status: 'created',
    movement: {
      _id: 'm' + row.row,
      title: row.title,
      direction: 'in',
      status: 'settled',
      date: '2026-10-28T00:00:00.000Z',
      grossValue: 10,
      account: { _id: 'acc1' },
      category: { _id: 'catR' },
      paymentMethod: 'pix',
      audit: {},
    },
  });
  const okResponse = (body: { rows: { row: number; title: string }[] }, replayed = false) => ({
    payload: {
      replayed,
      total: body.rows.length,
      created: body.rows.length,
      failed: 0,
      results: body.rows.map(created),
    },
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    svc = TestBed.inject(MovimentacoesService);
    importMovements = vi.fn().mockImplementation(async (body) => okResponse(body));
    (svc as unknown as { movementClient: unknown }).movementClient = {
      importMovements,
      list: vi.fn().mockResolvedValue({ payload: [] }),
    };
    (svc as unknown as { call: unknown }).call = (fn: (h: unknown) => Promise<unknown>) => fn({});
  });

  const lookup = {
    categories: [
      { id: 'catR', name: 'Venda Balcão', type: 'income' as const },
      { id: 'catD', name: 'Gás', type: 'expense' as const },
      // mesmo nome nos dois tipos: o tipo da linha decide
      { id: 'catRX', name: 'Outros', type: 'income' as const },
      { id: 'catDX', name: 'Outros', type: 'expense' as const },
    ],
    accounts: [{ id: 'acc1', name: 'Caixa' }],
  };

  const sentRows = (call = 0) => importMovements.mock.calls[call][0].rows;

  it('manda todas as linhas num único pedido, com o id de categoria e conta', async () => {
    const result = await svc.confirmImport([item({ row: 2 }), item({ row: 3, value: 11 })], lookup);
    expect(importMovements).toHaveBeenCalledTimes(1);
    expect(sentRows()).toHaveLength(2);
    expect(sentRows()[0]).toMatchObject({
      row: 2,
      accountId: 'acc1',
      categoryId: 'catR',
      grossValue: 10,
      date: '2026-10-28',
    });
    expect(sentRows()[0].confirmDuplicate).toBeUndefined();
    expect(result.insertedCount).toBe(2);
    expect(result.failedRows).toEqual([]);
  });

  it('acha categoria e conta mesmo com caixa e espaços diferentes (a prévia já aceita assim)', async () => {
    const result = await svc.confirmImport(
      [item({ categoryName: 'venda balcão ', accountName: ' CAIXA' })],
      lookup,
    );
    expect(sentRows()).toHaveLength(1);
    expect(result.failedRows).toEqual([]);
  });

  it('com o mesmo nome em receita e despesa, usa a categoria do tipo da linha', async () => {
    await svc.confirmImport(
      [
        item({ row: 2, type: 'income', categoryName: 'Outros' }),
        item({ row: 3, type: 'expense', categoryName: 'Outros', title: 'Gás' }),
      ],
      lookup,
    );
    expect(sentRows()[0].categoryId).toBe('catRX');
    expect(sentRows()[1].categoryId).toBe('catDX');
  });

  it('categoria só existe no outro tipo: a linha falha sem ir para a API', async () => {
    const result = await svc.confirmImport(
      [item({ type: 'expense', categoryName: 'Venda Balcão' })],
      lookup,
    );
    expect(importMovements).not.toHaveBeenCalled();
    expect(result.failedRows[0].error).toMatch(/categoria ou conta/i);
  });

  it('linhas idênticas no mesmo arquivo: só a 1ª passa pela trava de duplicidade', async () => {
    await svc.confirmImport([item({ row: 2 }), item({ row: 3 }), item({ row: 4 })], lookup);
    expect(sentRows()[0].confirmDuplicate).toBeUndefined();
    expect(sentRows()[1].confirmDuplicate).toBe(true);
    expect(sentRows()[2].confirmDuplicate).toBe(true);
  });

  it('linhas que só parecem iguais (valor ou data diferentes) não são forçadas', async () => {
    await svc.confirmImport(
      [item({ row: 2 }), item({ row: 3, value: 11 }), item({ row: 4, date: '2026-10-29' })],
      lookup,
    );
    expect(
      sentRows().every((r: { confirmDuplicate?: boolean }) => r.confirmDuplicate === undefined),
    ).toBe(true);
  });

  it('uma linha com falha não interrompe as demais e mostra o motivo da API', async () => {
    importMovements.mockImplementationOnce(async (body) => ({
      payload: {
        replayed: false,
        total: 3,
        created: 1,
        failed: 2,
        results: [
          {
            row: 2,
            status: 'failed',
            error: {
              code: 'CONFLICT',
              message: 'Conta inativa não pode receber lançamentos financeiros.',
            },
          },
          created(body.rows[1]),
          {
            row: 4,
            status: 'failed',
            error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos (date: Data inválida).' },
          },
        ],
      },
    }));
    const result = await svc.confirmImport(
      [item({ row: 2, value: 1 }), item({ row: 3, value: 2 }), item({ row: 4, value: 3 })],
      lookup,
    );
    expect(result.insertedCount).toBe(1);
    expect(result.failedRows.map((f) => f.row)).toEqual([2, 4]);
    expect(result.failedRows[0]).toMatchObject({ row: 2, title: 'Venda' });
    expect(result.failedRows[0].error).toBe(
      'Conta inativa não pode receber lançamentos financeiros.',
    );
    expect(result.failedRows[1].error).toMatch(/data, valor e se a categoria/);
  });

  it('falha sem motivo vira mensagem genérica', async () => {
    importMovements.mockImplementationOnce(async () => ({
      payload: {
        replayed: false,
        total: 1,
        created: 0,
        failed: 1,
        results: [{ row: 2, status: 'failed' }],
      },
    }));
    const result = await svc.confirmImport([item()], lookup);
    expect(result.failedRows[0].error).toBe('Falha ao gravar.');
  });

  it('se o pedido inteiro falhar, o erro sobe para a tela', async () => {
    importMovements.mockRejectedValueOnce(new Error('rede'));
    await expect(svc.confirmImport([item()], lookup)).rejects.toThrow('rede');
  });

  it('reenviar o mesmo lote sem resposta reaproveita a chave de idempotência', async () => {
    importMovements.mockRejectedValueOnce(new Error('rede'));
    await expect(svc.confirmImport([item()], lookup)).rejects.toThrow();
    await svc.confirmImport([item()], lookup);
    const [first, second] = importMovements.mock.calls.map(([b]) => b.idempotencyKey);
    expect(second).toBe(first);
    expect(first).toMatch(/^imp-.{8,}/);
  });

  it('depois de uma resposta, importar o mesmo conteúdo de novo usa uma chave nova', async () => {
    await svc.confirmImport([item()], lookup);
    await svc.confirmImport([item()], lookup);
    const [first, second] = importMovements.mock.calls.map(([b]) => b.idempotencyKey);
    expect(second).not.toBe(first);
  });

  it('conteúdo diferente nunca reaproveita a chave', async () => {
    importMovements.mockRejectedValueOnce(new Error('rede'));
    await expect(svc.confirmImport([item({ value: 10 })], lookup)).rejects.toThrow();
    await svc.confirmImport([item({ value: 99 })], lookup);
    const [first, second] = importMovements.mock.calls.map(([b]) => b.idempotencyKey);
    expect(second).not.toBe(first);
  });

  it('avisa quando a API devolveu uma importação que já tinha sido feita', async () => {
    importMovements.mockImplementationOnce(async (body) => okResponse(body, true));
    const result = await svc.confirmImport([item()], lookup);
    expect(result.replayed).toBe(true);
  });

  it('divide em pedidos de até o limite da API', async () => {
    const many = Array.from({ length: IMPORT_MOVEMENTS_MAX_ROWS + 5 }, (_, i) =>
      item({ row: i + 2, value: i + 1 }),
    );
    const result = await svc.confirmImport(many, lookup);
    expect(importMovements).toHaveBeenCalledTimes(2);
    expect(sentRows(0)).toHaveLength(IMPORT_MOVEMENTS_MAX_ROWS);
    expect(sentRows(1)).toHaveLength(5);
    expect(importMovements.mock.calls[1][0].idempotencyKey).not.toBe(
      importMovements.mock.calls[0][0].idempotencyKey,
    );
    expect(result.insertedCount).toBe(many.length);
  });
});

describe('parseNumberBR', () => {
  it('entende o jeito brasileiro de digitar', () => {
    expect(parseNumberBR('1.234,50')).toBe(1234.5);
    expect(parseNumberBR('R$ 1.234,50')).toBe(1234.5);
    expect(parseNumberBR('184,5')).toBe(184.5);
    expect(parseNumberBR('1.234.567,89')).toBe(1234567.89);
  });

  it('ponto sozinho: milhar quando parece milhar, decimal nos demais casos', () => {
    expect(parseNumberBR('1.234')).toBe(1234);
    expect(parseNumberBR('1234.5')).toBe(1234.5);
    expect(parseNumberBR('1.5')).toBe(1.5);
    expect(parseNumberBR('90')).toBe(90);
  });

  it('texto que não é número vira 0 (a prévia recusa)', () => {
    expect(parseNumberBR('')).toBe(0);
    expect(parseNumberBR('abc')).toBe(0);
    expect(parseNumberBR('12abc')).toBe(0);
  });
});

describe('normalizeDate', () => {
  it('aceita ISO e DD/MM/AAAA (com /, - ou .)', () => {
    expect(normalizeDate('2026-10-28')).toBe('2026-10-28');
    expect(normalizeDate('28/10/2026')).toBe('2026-10-28');
    expect(normalizeDate('5/3/2026')).toBe('2026-03-05');
    expect(normalizeDate('05-03-2026')).toBe('2026-03-05');
    expect(normalizeDate('05.03.2026')).toBe('2026-03-05');
  });

  it('recusa o que não é data de calendário', () => {
    expect(normalizeDate('31/02/2026')).toBeNull();
    expect(normalizeDate('2026-13-01')).toBeNull();
    expect(normalizeDate('ontem')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });

  it('ano bissexto', () => {
    expect(normalizeDate('29/02/2028')).toBe('2028-02-29');
    expect(normalizeDate('29/02/2027')).toBeNull();
  });
});
