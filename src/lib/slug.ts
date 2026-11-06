/**
 * Turns a business name into a web-safe address, e.g. "Mama Ade's Store" → "mama-ades-store".
 * Matches the database rule: 3–48 characters, lowercase letters, digits and hyphens,
 * starting and ending with a letter or digit.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (base.length >= 3) return base;
  return (base + "-shop").replace(/^-/, "").slice(0, 48);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
