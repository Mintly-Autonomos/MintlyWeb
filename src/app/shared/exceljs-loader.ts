import type { Workbook as WorkbookType } from 'exceljs';

type WorkbookCtor = typeof WorkbookType;

/**
 * Carrega o exceljs sob demanda e devolve a classe `Workbook`.
 *
 * O exceljs é CommonJS. No `ng serve` o `import('exceljs')` traz `Workbook` direto no módulo, mas no
 * build de produção ele chega dentro de `default` — `const { Workbook } = await import('exceljs')`
 * vinha `undefined` e "Baixar modelo" e a importação de .xlsx quebravam só no ar ("Ke is not a
 * constructor"). Aqui as duas formas funcionam.
 */
export async function loadWorkbook(
  load: () => Promise<unknown> = () => import('exceljs'),
): Promise<WorkbookCtor> {
  const mod = (await load()) as { Workbook?: WorkbookCtor; default?: { Workbook?: WorkbookCtor } };
  const Workbook = mod.Workbook ?? mod.default?.Workbook;
  if (typeof Workbook !== 'function') throw new Error('Biblioteca de planilha indisponível.');
  return Workbook;
}
