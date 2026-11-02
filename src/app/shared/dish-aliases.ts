import type { DishAliases } from './dish-match';

/**
 * Vínculos "texto da planilha -> prato do cardápio" escolhidos na revisão da importação, para a próxima
 * planilha já reconhecer o mesmo texto. Ficam neste navegador, separados por restaurante.
 */
const storageKey = (restaurantId: string | undefined): string =>
  `mintly-dish-aliases:${restaurantId ?? 'sem-restaurante'}`;

export function loadDishAliases(restaurantId: string | undefined): DishAliases {
  try {
    const raw = localStorage.getItem(storageKey(restaurantId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === 'string',
        ),
      );
    }
  } catch {
    /* sem storage ou guardado estragado: começa vazio */
  }
  return {};
}

/** Guarda a escolha (`prato` = id do prato, ou "ignore") e devolve o conjunto atualizado. */
export function saveDishAlias(
  restaurantId: string | undefined,
  textKey: string,
  value: string,
): DishAliases {
  const next = { ...loadDishAliases(restaurantId), [textKey]: value };
  try {
    localStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
  } catch {
    /* sem cota: vale só nesta sessão */
  }
  return next;
}
