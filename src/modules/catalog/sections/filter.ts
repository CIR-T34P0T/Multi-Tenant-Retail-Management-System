import type { ListFilter } from "./schemas";

export type Filterable = { name: string; description: string; status: "active" | "archived" };

/** Lower-case, accents removed, spaces collapsed: "  Café   Noir " → "cafe noir". */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word of the query must appear in the name or description. */
export function matchesQuery(item: Pick<Filterable, "name" | "description">, query: string) {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeForSearch(`${item.name} ${item.description}`);
  return words.every((w) => haystack.includes(w));
}

/** Applies the search text and status filter, sorted by name. */
export function applyListFilter<T extends Filterable>(
  items: readonly T[],
  filter: ListFilter,
): T[] {
  return items
    .filter((i) => filter.status === "all" || i.status === filter.status)
    .filter((i) => matchesQuery(i, filter.q))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
