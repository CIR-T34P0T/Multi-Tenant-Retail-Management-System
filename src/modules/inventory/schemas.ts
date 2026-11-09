import { z } from "zod";

/** Kinds of stock change a person can record by hand (counts have their own screen). */
export const MANUAL_TYPES = [
  "opening",
  "stock_in",
  "stock_out",
  "damaged",
  "expired",
  "missing",
  "written_off",
] as const;
export type ManualType = (typeof MANUAL_TYPES)[number];
export type MovementType = ManualType | "count";

export const WRITE_OFF_TYPES = ["damaged", "expired", "missing", "written_off"] as const;

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  opening: "Opening stock",
  stock_in: "Added",
  stock_out: "Deducted",
  damaged: "Damaged",
  expired: "Expired",
  missing: "Missing",
  written_off: "Written off",
  count: "Stock count",
};

/** Types that increase stock. */
export function isIncrease(type: ManualType): boolean {
  return type === "opening" || type === "stock_in";
}

/** Does this kind of change need a reason? (Matches the database rule.) */
export function needsReason(type: ManualType): boolean {
  return !isIncrease(type);
}

export const movementSchema = z.object({
  variantId: z.uuid(),
  type: z.enum(MANUAL_TYPES, { error: "Choose what happened" }),
  unitId: z.uuid({ error: "Choose a unit" }),
  quantity: z.string().trim().min(1, { error: "Enter a quantity" }),
  reason: z.string().trim().max(500, { error: "Keep the reason to 500 characters or fewer" }),
  confirmNegative: z.boolean(),
});

// ---------------------------------------------------------------- list filters

export const STOCK_STATUS_FILTERS = ["all", "low", "out", "negative", "ok"] as const;
export type StockStatusFilter = (typeof STOCK_STATUS_FILTERS)[number];
export type StockStatus = "ok" | "low" | "out" | "negative";
export const STOCK_PAGE_SIZE = 50;
export const MOVEMENT_PAGE_SIZE = 50;

export type StockFilter = {
  q: string;
  sectionId: string | null;
  categoryId: string | null;
  status: StockStatusFilter;
  archived: boolean;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const uuidOrNull = (v: string) => (z.uuid().safeParse(v).success ? v : null);
const pageOf = (v: string) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : 1;
};

/** Reads ?q=&section=&category=&status=&archived=1&page= safely (anything unexpected → defaults). */
export function parseStockFilter(params: Params): StockFilter {
  const status = first(params.status);
  return {
    q: first(params.q).replace(/\s+/g, " ").trim().slice(0, 100),
    sectionId: uuidOrNull(first(params.section)),
    categoryId: uuidOrNull(first(params.category)),
    status: (STOCK_STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as StockStatusFilter)
      : "all",
    archived: first(params.archived) === "1",
    page: pageOf(first(params.page)),
  };
}

export function stockFilterHref(filter: StockFilter, page = filter.page): string {
  const p = new URLSearchParams();
  if (filter.q) p.set("q", filter.q);
  if (filter.sectionId) p.set("section", filter.sectionId);
  if (filter.categoryId) p.set("category", filter.categoryId);
  if (filter.status !== "all") p.set("status", filter.status);
  if (filter.archived) p.set("archived", "1");
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

export const MOVEMENT_FILTERS = ["all", "in", "out", "writeoff", "count"] as const;
export type MovementFilter = (typeof MOVEMENT_FILTERS)[number];

export const MOVEMENT_FILTER_TYPES: Record<MovementFilter, MovementType[] | null> = {
  all: null,
  in: ["opening", "stock_in"],
  out: ["stock_out"],
  writeoff: [...WRITE_OFF_TYPES],
  count: ["count"],
};

export function parseMovementFilter(params: Params): { kind: MovementFilter; page: number } {
  const kind = first(params.kind);
  return {
    kind: (MOVEMENT_FILTERS as readonly string[]).includes(kind) ? (kind as MovementFilter) : "all",
    page: pageOf(first(params.page)),
  };
}
