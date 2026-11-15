import { isChunkLoadError, reloadOnceForChunkError } from './chunk-reload';

describe('recarregar quando um arquivo antigo falha depois de um deploy', () => {
  const memoria = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it('reconhece os erros de arquivo antigo dos navegadores', () => {
    expect(
      isChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: https://x/chunk-MCTYRRP2.js'),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('recarrega uma vez e não entra em laço se o erro se repetir logo depois', () => {
    const storage = memoria();
    const reload = vi.fn();
    const erro = new TypeError('Failed to fetch dynamically imported module');
    expect(reloadOnceForChunkError(erro, { storage, reload, now: 1_000_000 })).toBe(true);
    expect(reloadOnceForChunkError(erro, { storage, reload, now: 1_010_000 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // passado o intervalo, pode recarregar de novo (outro deploy)
    expect(reloadOnceForChunkError(erro, { storage, reload, now: 1_100_000 })).toBe(true);
  });

  it('outro tipo de erro não recarrega', () => {
    const reload = vi.fn();
    expect(reloadOnceForChunkError(new Error('500'), { storage: memoria(), reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
