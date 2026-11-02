/**
 * Leitura dos pratos de um pedido importado: "Curry + Batata Rústica; 2x Soyu e alho" vira uma lista de
 * pratos do cardápio. Só reconhece com IGUALDADE EXATA do nome já normalizado (sem acento, sem caixa,
 * sem espaços e pontuação): "Arróz com Batata" é o prato "arroz com batata", e é DIFERENTE de "arroz".
 * O que não bate fica "não reconhecido" e a pessoa decide (nada é adivinhado).
 */

/** Um pedaço do texto: o que estava escrito, a chave normalizada e a quantidade ("2x" = 2). */
export interface DishPart {
  text: string;
  key: string;
  qty: number;
}

/** Máximo de unidades de um prato numa venda (igual ao da API). */
export const DISH_QTY_MAX = 99;

/** "Arróz  com Batata!" -> "arrozcombatata": sem acento, maiúsculas, espaços nem pontuação. */
export function normalizeDishName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** "2x Arroz", "2 x Arroz", "Arroz x2", "Arroz 2x": tira a quantidade do texto. Sem número, vale 1. */
function withQuantity(raw: string): { text: string; qty: number } {
  const lead = raw.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i);
  if (lead) return { text: lead[2].trim(), qty: Number(lead[1]) };
  const trail =
    raw.match(/^(.+?)\s*[x×]\s*(\d{1,3})$/i) ?? raw.match(/^(.+?)\s+(\d{1,3})\s*[x×]$/i);
  if (trail) return { text: trail[1].trim(), qty: Number(trail[2]) };
  return { text: raw, qty: 1 };
}

/**
 * Separa o texto em pratos por "+", ";", "," e quebra de linha (o " e " NÃO separa: "Soyu e alho" é um
 * nome). O mesmo prato repetido soma as quantidades; pedaço vazio é descartado.
 */
export function splitDishText(text: string | null | undefined): DishPart[] {
  if (!text) return [];
  const merged = new Map<string, DishPart>();
  for (const piece of text.split(/[+;,\n\r]+/)) {
    const raw = piece.trim();
    if (!raw) continue;
    const { text: name, qty } = withQuantity(raw);
    const key = normalizeDishName(name);
    if (!key) continue;
    const prev = merged.get(key);
    if (prev) prev.qty = Math.min(DISH_QTY_MAX, prev.qty + qty);
    else merged.set(key, { text: name, key, qty: Math.max(1, Math.min(DISH_QTY_MAX, qty)) });
  }
  return [...merged.values()];
}

/** Escolha guardada para um texto: o id do prato, ou "ignore" para não contar. */
export const DISH_IGNORE = 'ignore';
export type DishAliases = Record<string, string>;

export interface DishLine extends DishPart {
  /** Prato reconhecido (nome igual ao do cardápio, ou escolha guardada). */
  menuItemId: string | null;
  /** A pessoa mandou ignorar este texto: não entra como prato nem como "não reconhecido". */
  ignored: boolean;
  /** Só quando NÃO reconheceu: o prato de nome mais parecido, para sugerir (não é aplicado sozinho). */
  suggestion: { id: string; name: string } | null;
}

/** Semelhança (0 a 1) entre duas chaves normalizadas, por pares de letras (Dice). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++)
      m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let common = 0;
  for (const [k, n] of pa) common += Math.min(n, pb.get(k) ?? 0);
  return (2 * common) / (a.length - 1 + (b.length - 1));
}

/** Abaixo disto o prato parecido não vale como sugestão. */
export const SUGGESTION_MIN = 0.6;

/** Liga cada pedaço a um prato do cardápio (nome igual > escolha guardada) ou o deixa "não reconhecido". */
export function matchDishLines(
  parts: DishPart[],
  dishes: { id: string; name: string }[],
  aliases: DishAliases = {},
): DishLine[] {
  const byKey = new Map(dishes.map((d) => [normalizeDishName(d.name), d.id]));
  return parts.map((part) => {
    const exact = byKey.get(part.key);
    if (exact) return { ...part, menuItemId: exact, ignored: false, suggestion: null };

    const saved = aliases[part.key];
    if (saved === DISH_IGNORE)
      return { ...part, menuItemId: null, ignored: true, suggestion: null };
    if (saved && dishes.some((d) => d.id === saved)) {
      return { ...part, menuItemId: saved, ignored: false, suggestion: null };
    }

    let best: { id: string; name: string } | null = null;
    let bestScore = 0;
    for (const d of dishes) {
      const score = similarity(part.key, normalizeDishName(d.name));
      if (score > bestScore) {
        bestScore = score;
        best = { id: d.id, name: d.name };
      }
    }
    return {
      ...part,
      menuItemId: null,
      ignored: false,
      suggestion: bestScore >= SUGGESTION_MIN ? best : null,
    };
  });
}

/** Os pratos reconhecidos, prontos para enviar (o mesmo prato de dois textos soma as quantidades). */
export function recognizedItems(lines: DishLine[]): { menuItemId: string; qty: number }[] {
  const sums = new Map<string, number>();
  for (const l of lines) {
    if (l.menuItemId)
      sums.set(l.menuItemId, Math.min(DISH_QTY_MAX, (sums.get(l.menuItemId) ?? 0) + l.qty));
  }
  return [...sums].map(([menuItemId, qty]) => ({ menuItemId, qty }));
}
