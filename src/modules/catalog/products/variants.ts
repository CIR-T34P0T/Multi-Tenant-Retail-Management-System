/**
 * Pure helpers for product options and variants (no database, no React),
 * shared by the product form and the server.
 */

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 200;

export type OptionInput = { name: string; values: string[] };

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** "S, M,  L, m" → ["S", "M", "L"] (trimmed, duplicates ignoring capitals removed). */
export function parseOptionValues(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const value = tidy(raw);
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      out.push(value);
    }
  }
  return out;
}

/** Every combination of option values, in order: Size × Colour → [M, White], [M, Black]… */
export function combineOptions(options: OptionInput[]): string[][] {
  const used = options.filter((o) => o.values.length > 0);
  if (used.length === 0) return [[]];
  return used.reduce<string[][]>(
    (acc, option) => acc.flatMap((combo) => option.values.map((v) => [...combo, v])),
    [[]],
  );
}

/** Display name of a variant: "M / White", or "Standard" when there are no options. */
export function variantLabel(optionValues: readonly string[]): string {
  return optionValues.length > 0 ? optionValues.join(" / ") : "Standard";
}

/** Stable key for a combination of option values (case-insensitive). */
export function variantKey(optionValues: readonly string[]): string {
  return optionValues.map((v) => v.toLowerCase()).join("\u0000");
}

function skuPart(text: string, length: number): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, length);
}

/**
 * Suggests a product code from the name and option values:
 * "Men's Jalab", [M, White] → "MENS-JALA-M-WHI". Always matches the database
 * rule (letters, digits and dashes; at most 40 characters).
 */
export function suggestSku(productName: string, optionValues: readonly string[]): string {
  const words = productName
    .split(/\s+/)
    .map((w) => skuPart(w, 4))
    .filter(Boolean)
    .slice(0, 3);
  const base = words.length > 0 ? words.join("-") : "ITEM";
  const parts = optionValues.map((v) => skuPart(v, 3)).filter(Boolean);
  return [base, ...parts].join("-").slice(0, 40).replace(/-+$/, "");
}

/** Makes a code unique against codes already taken (case-insensitive): X, X-2, X-3… */
export function uniqueSku(candidate: string, taken: ReadonlySet<string>): string {
  const upper = (s: string) => s.toUpperCase();
  if (!taken.has(upper(candidate))) return candidate;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const next = candidate.slice(0, 40 - suffix.length) + suffix;
    if (!taken.has(upper(next))) return next;
  }
}

export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;
export const BARCODE_PATTERN = /^[A-Za-z0-9-]{4,32}$/;
