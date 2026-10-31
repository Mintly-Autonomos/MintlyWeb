import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Workbook } from 'exceljs';
import {
  MovimentacoesService,
  ImportMovementItem,
  IMPORT_CHUNK_ROWS,
  buildImportPreview,
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

  it('recusa arquivo que não é planilha nem csv, com mensagem em português', async () => {
    await expect(svc.previewImport(new File(['x'], 'vendas.pdf'))).rejects.toThrow(/\.xlsx/);
    await expect(svc.previewImport(new File(['não sou um zip'], 'quebrado.xlsx'))).rejects.toThrow(
      /\.xlsx/,
    );
  });

  describe('planilha do jeito que o dono do restaurante manda (base do Keeta)', () => {
    /** Mesmo cabeçalho e valores da base-receitas-keeta-outubro-2026.xlsx: nomes em minúsculas e formas por extenso. */
    const keeta = (): Linha[] => [
      [
        'Receita',
        'Pedido 7235 - Tradicional + Batata Rústica',
        125,
        '2026-10-29',
        'Venda delivery',
        'Keeta',
        'Pix',
        'Recebido',
        '',
      ],
      [
        'Receita',
        'Pedido 1145 - Apimentado + Batata Rústica',
        135,
        '2026-10-29',
        'Venda delivery',
        'Keeta',
        'Carteira digital',
        'Recebido',
        '',
      ],
      [
        'Receita',
        'Pedido 0985 - Tradicional + Batata Rústica',
        125,
        '2026-10-25',
        'Venda delivery',
        'Keeta',
        'Cartão de crédito',
        'Recebido',
        '',
      ],
    ];

    it('entende "Pix", "Carteira digital" e "Cartão de crédito" como as formas do Mintly', async () => {
      const { items, validRows } = await svc.previewImport(await planilha(keeta()));
      expect(items.map((i) => i.paymentMethod)).toEqual(['PIX', 'Carteira Digital', 'Crédito']);
      expect(items.every((i) => i.type === 'income' && i.status === 'received')).toBe(true);
      expect(validRows).toBe(3);
    });
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

describe('Importar em massa — planilhas fora do modelo', () => {
  const g = (rows: unknown[][]) => rows.map((cells, i) => ({ row: i + 1, cells }));

  it('acha as colunas pelo NOME do cabeçalho, em qualquer ordem e com sinônimos', () => {
    const { items } = buildImportPreview(
      'x.xlsx',
      g([
        [
          'Descrição',
          'Data',
          'Valor bruto',
          'Situação',
          'Forma de pagamento',
          'Categoria',
          'Conta',
          'Natureza',
        ],
        ['Gás', '05/10/2026', '1.234,50', 'Pago', 'Débito', 'Gás', 'Caixa', 'Saída'],
      ]),
    );
    expect(items[0]).toMatchObject({
      type: 'expense',
      title: 'Gás',
      value: 1234.5,
      date: '2026-10-05',
      categoryName: 'Gás',
      accountName: 'Caixa',
      paymentMethod: 'Débito',
      status: 'paid',
      valid: true,
    });
  });

  it('o que a planilha não trouxer fica em branco para preencher na revisão (e não derruba a linha)', () => {
    const { items, validRows } = buildImportPreview(
      'x.xlsx',
      g([
        ['Pedido', 'Total', 'Data'],
        ['Pedido 1', 125, '2026-10-29'],
      ]),
    );
    expect(items[0]).toMatchObject({
      title: 'Pedido 1',
      value: 125,
      date: '2026-10-29',
      type: null,
      categoryName: '',
      accountName: '',
      paymentMethod: null,
      status: null,
    });
    expect(items[0].valid).toBe(false);
    expect(items[0].error).toContain('falta a categoria');
    expect(items[0].error).toContain('falta a conta');
    expect(items[0].error).toContain('falta a forma de pagamento');
    expect(validRows).toBe(0);
  });

  it('sem coluna de tipo, valor negativo é saída e o valor vira positivo', () => {
    const { items } = buildImportPreview(
      'x.xlsx',
      g([
        ['Título', 'Valor', 'Data'],
        ['Luz', '-245,90', '2026-10-05'],
        ['Venda', '50', '2026-10-05'],
      ]),
    );
    expect(items[0]).toMatchObject({ type: 'expense', value: 245.9 });
    expect(items[1].type).toBeNull();
  });

  it('"Concluído" vira Recebido em entrada e Pago em saída', () => {
    const { items } = buildImportPreview(
      'x.xlsx',
      g([
        ['Tipo', 'Título', 'Valor', 'Data', 'Status'],
        ['Receita', 'a', 1, '2026-10-05', 'Concluído'],
        ['Despesa', 'b', 1, '2026-10-05', 'concluido'],
      ]),
    );
    expect(items.map((i) => i.status)).toEqual(['received', 'paid']);
  });

  it('cabeçalho que não dá para reconhecer cai na ordem do modelo do Mintly', () => {
    const { items } = buildImportPreview(
      'x.xlsx',
      g([
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
        ['receita', 'Venda', 10, '2026-10-28', 'Venda Balcão', 'Caixa', 'PIX', 'Recebido', 'obs'],
      ]),
    );
    expect(items[0]).toMatchObject({
      type: 'income',
      title: 'Venda',
      categoryName: 'Venda Balcão',
      notes: 'obs',
      valid: true,
    });
  });

  it('data inválida guarda o texto original para a mensagem', () => {
    const { items } = buildImportPreview(
      'x.xlsx',
      g([
        ['Tipo', 'Título', 'Valor', 'Data'],
        ['receita', 'a', 1, 'ontem'],
      ]),
    );
    expect(items[0].date).toBe('');
    expect(items[0].dateRaw).toBe('ontem');
    expect(items[0].error).toContain('"ontem" inválida');
  });

  it('título com mais de 120 caracteres (como a linha 14 da base do Keeta) é sinalizado para encurtar', () => {
    const titulo =
      'Pedido 8547 - Curry + Batata Rústica; Soyu e alho + Batata Rústica; Apimentado + Batata Rústica; Tradicional + Batata Rústica';
    expect(titulo.length).toBe(125);
    const { items } = buildImportPreview(
      'x.xlsx',
      g([
        ['Tipo', 'Título', 'Valor', 'Data', 'Categoria', 'Conta', 'Forma de pagamento', 'Status'],
        ['Receita', titulo, 135, '2026-10-29', 'Venda Delivery', 'Keeta', 'Pix', 'Recebido'],
      ]),
    );
    expect(items[0].valid).toBe(false);
    expect(items[0].error).toBe(
      'título passa de 120 caracteres (tem 125): encurte e coloque os detalhes em Observações',
    );
  });

  it('observações com mais de 500 caracteres são sinalizadas; até 500 passam', () => {
    const base = [
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
    const linha = (obs: string) => [
      'Receita',
      'Pedido',
      10,
      '2026-10-29',
      'Venda Delivery',
      'Keeta',
      'Pix',
      'Recebido',
      obs,
    ];
    const { items } = buildImportPreview(
      'x.xlsx',
      g([base, linha('x'.repeat(500)), linha('x'.repeat(501))]),
    );
    expect(items[0].valid).toBe(true);
    expect(items[1].valid).toBe(false);
    expect(items[1].error).toBe('observações passam de 500 caracteres (têm 501): encurte');
  });

  it('arquivo vazio não quebra', () => {
    expect(buildImportPreview('x.xlsx', [])).toMatchObject({ totalRows: 0, items: [] });
  });
});

describe('Importar em massa — CSV', () => {
  let svc: MovimentacoesService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    svc = TestBed.inject(MovimentacoesService);
  });

  const csv = (text: string, name = 'vendas.csv') => new File([text], name);

  it('lê CSV com ponto e vírgula (Excel brasileiro), valor com vírgula e BOM', async () => {
    const file = csv(
      '\uFEFFTipo;Título;Valor;Data;Categoria;Conta;Forma de pagamento;Status\r\n' +
        'Receita;Pedido 1;"1.234,50";29/10/2026;Venda Delivery;Keeta;Pix;Recebido\r\n' +
        'Despesa;Gás;90,00;05/10/2026;Gás;Caixa;Dinheiro;Pago\r\n',
    );
    const { items, totalRows } = await svc.previewImport(file);
    expect(totalRows).toBe(2);
    expect(items[0]).toMatchObject({
      type: 'income',
      value: 1234.5,
      date: '2026-10-29',
      paymentMethod: 'PIX',
      status: 'received',
      valid: true,
    });
    expect(items[1]).toMatchObject({
      type: 'expense',
      value: 90,
      paymentMethod: 'Dinheiro',
      status: 'paid',
    });
  });

  it('lê CSV com vírgula e título entre aspas com vírgula dentro', async () => {
    const file = csv('tipo,titulo,valor,data\nreceita,"Pedido 1, com batata",125.5,2026-10-29\n');
    const { items } = await svc.previewImport(file);
    expect(items[0]).toMatchObject({
      title: 'Pedido 1, com batata',
      value: 125.5,
      date: '2026-10-29',
    });
  });

  it('lê CSV salvo pelo Excel em Windows-1252 (acentos)', async () => {
    // "Descrição;Valor\nBatata rústica;10" com ç/ã/ú em Windows-1252 (um byte cada)
    const bytes = new Uint8Array([
      0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f, 0x3b, 0x56, 0x61, 0x6c, 0x6f, 0x72,
      0x0a, 0x42, 0x61, 0x74, 0x61, 0x74, 0x61, 0x20, 0x72, 0xfa, 0x73, 0x74, 0x69, 0x63, 0x61,
      0x3b, 0x31, 0x30, 0x0a,
    ]);
    const { items } = await svc.previewImport(new File([bytes], 'excel.csv'));
    expect(items[0]).toMatchObject({ title: 'Batata rústica', value: 10 });
  });

  it('CSV sem linhas de dados dá prévia vazia', async () => {
    const { totalRows } = await svc.previewImport(csv('Tipo;Título;Valor\n'));
    expect(totalRows).toBe(0);
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
    expect(result.failedRows[1].error).toBe(
      'A API recusou os dados: Dados inválidos (date: Data inválida).',
    );
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

  it('divide em pedidos pequenos, para cada um responder antes do limite de tempo', async () => {
    const many = Array.from({ length: IMPORT_CHUNK_ROWS + 5 }, (_, i) =>
      item({ row: i + 2, value: i + 1 }),
    );
    const progress: [number, number][] = [];
    const result = await svc.confirmImport(many, lookup, (done, total) =>
      progress.push([done, total]),
    );
    expect(importMovements).toHaveBeenCalledTimes(2);
    expect(sentRows(0)).toHaveLength(IMPORT_CHUNK_ROWS);
    expect(sentRows(1)).toHaveLength(5);
    expect(progress).toEqual([
      [0, IMPORT_CHUNK_ROWS + 5],
      [IMPORT_CHUNK_ROWS, IMPORT_CHUNK_ROWS + 5],
      [IMPORT_CHUNK_ROWS + 5, IMPORT_CHUNK_ROWS + 5],
    ]);
    expect(importMovements.mock.calls[1][0].idempotencyKey).not.toBe(
      importMovements.mock.calls[0][0].idempotencyKey,
    );
    expect(result.insertedCount).toBe(many.length);
  });
});

describe('Importar em massa — linha sem tipo, forma de pagamento ou status', () => {
  it('não vai para a API: falha na hora com o motivo', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const svc = TestBed.inject(MovimentacoesService);
    const importMovements = vi.fn();
    (svc as unknown as { movementClient: unknown }).movementClient = {
      importMovements,
      list: vi.fn().mockResolvedValue({ payload: [] }),
    };
    const incomplete: ImportMovementItem = {
      row: 2,
      type: 'income',
      title: 'x',
      value: 1,
      date: '2026-10-28',
      categoryName: 'A',
      accountName: 'B',
      paymentMethod: null,
      status: 'received',
      notes: null,
      valid: true,
      error: null,
    };
    const result = await svc.confirmImport([incomplete], { categories: [], accounts: [] });
    expect(importMovements).not.toHaveBeenCalled();
    expect(result.failedRows[0].error).toContain('forma de pagamento');
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
