import { z } from "zod";

/** Mirrors the database rules in migration 20261106140000 (names 1–60, descriptions ≤ 300). */
const name = z
  .string()
  .trim()
  .min(1, { error: "Enter a name" })
  .max(60, { error: "Use 60 characters or fewer" });
const description = z
  .string()
  .trim()
  .max(300, { error: "Use 300 characters or fewer" })
  .default("");

export const sectionSchema = z.object({ name, description });
export const categorySchema = z.object({
  name,
  description,
  sectionId: z.uuid({ error: "Choose a section" }),
});

export const recordIdSchema = z.uuid();

export type SectionInput = z.infer<typeof sectionSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;

export const STATUS_FILTERS = ["active", "archived", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type ListFilter = { q: string; status: StatusFilter };

/** Reads ?q= and ?status= from the address bar safely (anything unexpected → defaults). */
export function parseListFilter(params: Record<string, string | string[] | undefined>): ListFilter {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = first(params.q).trim().slice(0, 100);
  const status = first(params.status);
  return {
    q,
    status: (STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as StatusFilter)
      : "active",
  };
}
