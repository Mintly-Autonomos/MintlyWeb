/**
 * Depois de um deploy novo, quem estava com o app aberto pede arquivos (pedaços lazy das telas) que não existem
 * mais. O navegador recebe o HTML do app no lugar do JavaScript e a tela não abre ("Failed to fetch dynamically
 * imported module"). A saída é recarregar a página uma vez, para buscar os arquivos da versão nova.
 */
const RELOAD_KEY = 'mintly-chunk-reload-at';
/** Não recarrega de novo dentro deste intervalo (evita laço se o erro for outro). */
const RELOAD_GUARD_MS = 60_000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i;

export function isChunkLoadError(err: unknown): boolean {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err);
  return CHUNK_ERROR.test(message);
}

/** Recarrega a página uma vez quando o erro é de arquivo antigo. Devolve se recarregou. */
export function reloadOnceForChunkError(
  err: unknown,
  deps: { storage?: Pick<Storage, 'getItem' | 'setItem'>; reload?: () => void; now?: number } = {},
): boolean {
  if (!isChunkLoadError(err)) return false;
  const storage = deps.storage ?? safeSessionStorage();
  const now = deps.now ?? Date.now();
  const last = Number(storage?.getItem(RELOAD_KEY) ?? 0);
  if (now - last < RELOAD_GUARD_MS) return false;
  storage?.setItem(RELOAD_KEY, String(now));
  (deps.reload ?? (() => location.reload()))();
  return true;
}

function safeSessionStorage(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}
