import { loadWorkbook } from './exceljs-loader';

class FakeWorkbook {}

describe('loadWorkbook (exceljs sob demanda, em dev e no build de produção)', () => {
  it('módulo com Workbook direto (ng serve)', async () => {
    expect(await loadWorkbook(async () => ({ Workbook: FakeWorkbook }))).toBe(FakeWorkbook);
  });

  it('módulo com Workbook dentro de default (build de produção: CommonJS)', async () => {
    expect(await loadWorkbook(async () => ({ default: { Workbook: FakeWorkbook } }))).toBe(
      FakeWorkbook,
    );
  });

  it('sem Workbook: erro claro em vez de "is not a constructor"', async () => {
    await expect(loadWorkbook(async () => ({ default: {} }))).rejects.toThrow(
      'Biblioteca de planilha indisponível.',
    );
  });

  it('o pacote de verdade carrega e cria uma planilha', async () => {
    const Workbook = await loadWorkbook();
    const wb = new Workbook();
    wb.addWorksheet('Movimentações');
    expect(wb.worksheets).toHaveLength(1);
  });
});
