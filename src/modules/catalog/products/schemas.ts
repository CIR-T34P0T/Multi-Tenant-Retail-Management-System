import { z } from "zod";
import { parseDecimalInput } from "@/lib/decimal";
import { BARCODE_PATTERN, MAX_OPTIONS, MAX_VARIANTS, SKU_PATTERN } from "./variants";

/** Largest values the database columns can hold (numeric(18,2) / (18,4) / (18,6)). */
export const MAX_PRICE = "9999999999999999.99";
export const MAX_QUANTITY = "99999999999999.9999";
export const MAX_FACTOR = "999999999999.999999";

export const priceRule = { maxDecimals: 2, max: MAX_PRICE, label: "Price" } as const;
export const costRule = { maxDecimals: 4, max: MAX_QUANTITY, label: "Cost" } as const;

export function quantityRule(allowsDecimal: boolean, label = "Quantity") {
  return { maxDecimals: allowsDecimal ? 4 : 0, max: MAX_QUANTITY, label } as const;
}
export function factorRule(baseAllowsDecimal: boolean) {
  return {
    maxDecimals: baseAllowsDecimal ? 6 : 0,
    allowZero: false,
    max: MAX_FACTOR,
    label: "Quantity",
  } as const;
}

const text = (max: number, message: string) =>
  z.string().trim().max(max, { error: message }).default("");

export const productDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a product name" })
    .max(120, { error: "Use 120 characters or fewer" }),
  brand: text(60, "Use 60 characters or fewer"),
  description: text(1000, "Use 1000 characters or fewer"),
  sectionId: z.uuid({ error: "Choose a section" }),
  categoryId: z
    .union([z.uuid(), z.literal("")])
    .default("")
    .transform((v) => v || null),
});

const optionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Name this option" })
    .max(30, { error: "Use 30 characters or fewer" }),
  values: z
    .array(z.string().trim().min(1).max(30, { error: "Values must be 30 characters or fewer" }))
    .min(1, { error: "Add at least one value" })
    .max(50, { error: "Use at most 50 values" }),
});

const variantSchema = z.object({
  optionValues: z.array(z.string().trim().min(1).max(30)).max(MAX_OPTIONS),
  sku: z
    .string()
    .trim()
    .refine((s) => s === "" || SKU_PATTERN.test(s), {
      error: "Use letters, numbers and - . _ / only (up to 40)",
    })
    .default(""),
  barcode: z
    .string()
    .trim()
    .refine((s) => s === "" || BARCODE_PATTERN.test(s), {
      error: "Barcodes are 4–32 letters or numbers",
    })
    .default(""),
  price: z.string().default(""),
  cost: z.string().default(""),
  minStock: z.string().default(""),
});

const extraUnitSchema = z.object({
  unitId: z.uuid({ error: "Choose a unit" }),
  factor: z.string(),
  price: z.string().default(""),
});

/** What the "New product" form sends to the server. */
export const newProductSchema = productDetailsSchema.extend({
  baseUnitId: z.uuid({ error: "Choose a unit" }),
  options: z.array(optionSchema).max(MAX_OPTIONS, { error: "Use at most 3 options" }),
  extraUnits: z.array(extraUnitSchema).max(10),
  variants: z
    .array(variantSchema)
    .min(1, { error: "Keep at least one variant" })
    .max(MAX_VARIANTS, { error: `A product can have at most ${MAX_VARIANTS} variants` }),
});

export type NewProductInput = z.input<typeof newProductSchema>;
export type NewProduct = z.output<typeof newProductSchema>;

export const variantEditSchema = z.object({
  sku: variantSchema.shape.sku,
  barcode: variantSchema.shape.barcode,
  minStock: z.string().default(""),
  optionValues: z
    .array(z.string().trim().min(1, { error: "Enter a value" }).max(30))
    .max(MAX_OPTIONS),
});

export const idSchema = z.uuid();

/** Turns Zod issues into { "variants.2.price": ["…"] } for the form. */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Parses an optional amount field: "" → null; otherwise the exact decimal or an error. */
export function optionalDecimal(
  raw: string,
  rule: Parameters<typeof parseDecimalInput>[1],
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw.trim() === "") return { ok: true, value: null };
  return parseDecimalInput(raw, rule);
}

// ---------------------------------------------------------------- list filters

export const PRODUCT_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];
export const PAGE_SIZE = 25;

export type ProductListFilter = {
  q: string;
  sectionId: string | null;
  categoryId: string | null;
  status: ProductStatusFilter;
  page: number;
};

/** Reads ?q=&section=&category=&status=&page= safely (anything unexpected → defaults). */
export function parseProductListFilter(
  params: Record<string, string | string[] | undefined>,
): ProductListFilter {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const uuidOrNull = (v: string) => (idSchema.safeParse(v).success ? v : null);
  const status = first(params.status);
  const page = Number.parseInt(first(params.page), 10);
  return {
    // Characters with special meaning in search queries are dropped.
    q: first(params.q)
      .replace(/[,()*%\\"]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100),
    sectionId: uuidOrNull(first(params.section)),
    categoryId: uuidOrNull(first(params.category)),
    status: (PRODUCT_STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as ProductStatusFilter)
      : "active",
    page: Number.isFinite(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}
