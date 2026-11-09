import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  MOVEMENT_FILTER_TYPES,
  MOVEMENT_PAGE_SIZE,
  STOCK_PAGE_SIZE,
  type MovementFilter,
  type MovementType,
  type StockFilter,
  type StockStatus,
} from "./schemas";

/**
 * Reads for the inventory screens. Everything runs as the signed-in user, so
 * Row-Level Security decides what comes back. Quantities are read as text
 * (`::text`) so they never pass through JavaScript floating-point numbers.
 */

export type StockRow = {
  variantId: string;
  productId: string;
  productName: string;
  brand: string;
  label: string;
  sku: string;
  sectionName: string;
  categoryName: string | null;
  unitCode: string;
  onHand: string;
  minLevel: string;
  status: StockStatus;
  isActive: boolean;
};

/** "M / White", or "" for a product without options. */
export function optionsLabel(values: string[] | null | undefined): string {
  return (values ?? []).join(" / ");
}

const STOCK_COLUMNS =
  "variant_id, product_id, product_name, brand, option_values, sku, section_name, category_name, base_unit_code, on_hand::text, min_stock_level::text, stock_status, is_active, total_count::text";

export async function listStock(businessId: string, filter: StockFilter) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("stock_overview", {
      p_business: businessId,
      p_q: filter.q,
      p_section: filter.sectionId ?? undefined,
      p_category: filter.categoryId ?? undefined,
      p_status: filter.status,
      p_archived: filter.archived,
      p_limit: STOCK_PAGE_SIZE,
      p_offset: (filter.page - 1) * STOCK_PAGE_SIZE,
    })
    .select(STOCK_COLUMNS);
  if (error) throw new Error(`Could not load stock: ${error.message}`);
  const rows = (data ?? []) as unknown as {
    variant_id: string;
    product_id: string;
    product_name: string;
    brand: string | null;
    option_values: string[];
    sku: string;
    section_name: string;
    category_name: string | null;
    base_unit_code: string;
    on_hand: string;
    min_stock_level: string;
    stock_status: StockStatus;
    is_active: boolean;
    total_count: string;
  }[];
  return {
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    rows: rows.map((r): StockRow => ({
      variantId: r.variant_id,
      productId: r.product_id,
      productName: r.product_name,
      brand: r.brand ?? "",
      label: optionsLabel(r.option_values),
      sku: r.sku,
      sectionName: r.section_name,
      categoryName: r.category_name,
      unitCode: r.base_unit_code,
      onHand: r.on_hand,
      minLevel: r.min_stock_level,
      status: r.stock_status,
      isActive: r.is_active,
    })),
  };
}

export async function getStockSummary(businessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("stock_summary", { p_business: businessId })
    .select("items::text, low::text, out_of_stock::text, negative::text")
    .single();
  if (error) throw new Error(`Could not load stock summary: ${error.message}`);
  const d = data as unknown as Record<"items" | "low" | "out_of_stock" | "negative", string>;
  return {
    items: Number(d.items),
    low: Number(d.low),
    out: Number(d.out_of_stock),
    negative: Number(d.negative),
  };
}

// ---------------------------------------------------------------- one item

export type ItemUnit = {
  unitId: string;
  code: string;
  name: string;
  factor: string;
  isBase: boolean;
};

export type StockItem = {
  variantId: string;
  productId: string;
  productName: string;
  label: string;
  sku: string;
  barcode: string | null;
  sectionName: string;
  baseUnitCode: string;
  baseAllowsDecimal: boolean;
  onHand: string;
  minLevel: string;
  status: StockStatus;
  isActive: boolean;
  hasMovements: boolean;
  units: ItemUnit[];
};

export async function getStockItem(
  businessId: string,
  variantId: string,
): Promise<StockItem | null> {
  const supabase = await createClient();
  const { data: v, error } = await supabase
    .from("product_variants")
    .select(
      `id, sku, barcode, option_values, min_stock_level::text, status,
       products!inner(id, name, status, sections(name), units!products_business_id_base_unit_id_fkey(code, allows_decimal)),
       stock_levels(on_hand::text, movement_count::text)`,
    )
    .eq("business_id", businessId)
    .eq("id", variantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load item: ${error.message}`);
  if (!v) return null;
  const row = v as unknown as {
    id: string;
    sku: string;
    barcode: string | null;
    option_values: string[];
    min_stock_level: string;
    status: string;
    products: {
      id: string;
      name: string;
      status: string;
      sections: { name: string } | null;
      units: { code: string; allows_decimal: boolean } | null;
    };
    stock_levels: { on_hand: string; movement_count: string } | null;
  };
  // Without stock permission the balance is hidden by the database: treat as not found.
  if (!row.stock_levels) return null;

  const { data: units, error: unitsError } = await supabase
    .from("product_units")
    .select("unit_id, factor::text, is_base, units(code, name)")
    .eq("business_id", businessId)
    .eq("product_id", row.products.id)
    .eq("status", "active")
    .order("factor");
  if (unitsError) throw new Error(`Could not load units: ${unitsError.message}`);

  const onHand = row.stock_levels.on_hand;
  const min = row.min_stock_level;
  const n = Number(onHand);
  const status: StockStatus =
    n < 0 ? "negative" : n === 0 ? "out" : Number(min) > 0 && n <= Number(min) ? "low" : "ok";
  return {
    variantId: row.id,
    productId: row.products.id,
    productName: row.products.name,
    label: optionsLabel(row.option_values),
    sku: row.sku,
    barcode: row.barcode,
    sectionName: row.products.sections?.name ?? "",
    baseUnitCode: row.products.units?.code ?? "",
    baseAllowsDecimal: row.products.units?.allows_decimal ?? false,
    onHand,
    minLevel: min,
    status,
    isActive: row.status === "active" && row.products.status === "active",
    hasMovements: row.stock_levels.movement_count !== "0",
    units: (
      (units ?? []) as unknown as {
        unit_id: string;
        factor: string;
        is_base: boolean;
        units: { code: string; name: string } | null;
      }[]
    ).map((u) => ({
      unitId: u.unit_id,
      code: u.units?.code ?? "",
      name: u.units?.name ?? "",
      factor: u.factor,
      isBase: u.is_base,
    })),
  };
}

// ---------------------------------------------------------------- movements

export type MovementRow = {
  id: string;
  createdAt: string;
  variantId: string;
  productName: string;
  label: string;
  sku: string;
  type: MovementType;
  quantity: string;
  balanceBefore: string;
  balanceAfter: string;
  enteredQuantity: string;
  enteredUnitCode: string;
  baseUnitCode: string;
  reason: string | null;
  countId: string | null;
  by: string;
};

export async function listMovements(
  businessId: string,
  options: {
    variantId?: string;
    kind?: MovementFilter;
    countId?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const supabase = await createClient();
  const pageSize = options.pageSize ?? MOVEMENT_PAGE_SIZE;
  const types = MOVEMENT_FILTER_TYPES[options.kind ?? "all"];
  const { data, error } = await supabase
    .rpc("stock_movement_history", {
      p_business: businessId,
      p_variant: options.variantId,
      p_types: types ?? undefined,
      p_count: options.countId,
      p_limit: pageSize,
      p_offset: ((options.page ?? 1) - 1) * pageSize,
    })
    .select(
      "id, created_at, variant_id, product_name, option_values, sku, movement_type, quantity::text, balance_before::text, balance_after::text, entered_quantity::text, entered_unit_code, base_unit_code, reason, stock_count_id, created_by_name, total_count::text",
    );
  if (error) throw new Error(`Could not load stock history: ${error.message}`);
  const rows = (data ?? []) as unknown as {
    id: string;
    created_at: string;
    variant_id: string;
    product_name: string;
    option_values: string[];
    sku: string;
    movement_type: MovementType;
    quantity: string;
    balance_before: string;
    balance_after: string;
    entered_quantity: string;
    entered_unit_code: string;
    base_unit_code: string;
    reason: string | null;
    stock_count_id: string | null;
    created_by_name: string;
    total_count: string;
  }[];
  return {
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    rows: rows.map((r): MovementRow => ({
      id: r.id,
      createdAt: r.created_at,
      variantId: r.variant_id,
      productName: r.product_name,
      label: optionsLabel(r.option_values),
      sku: r.sku,
      type: r.movement_type,
      quantity: r.quantity,
      balanceBefore: r.balance_before,
      balanceAfter: r.balance_after,
      enteredQuantity: r.entered_quantity,
      enteredUnitCode: r.entered_unit_code,
      baseUnitCode: r.base_unit_code,
      reason: r.reason,
      countId: r.stock_count_id,
      by: r.created_by_name,
    })),
  };
}

// ---------------------------------------------------------------- stock counts

export type CountStatus = "open" | "posted" | "cancelled";

export type CountSummary = {
  id: string;
  number: number;
  status: CountStatus;
  scope: string;
  note: string | null;
  createdAt: string;
  closedAt: string | null;
  lines: number;
  counted: number;
};

type CountRow = {
  id: string;
  number: number;
  status: CountStatus;
  note: string | null;
  created_at: string;
  posted_at: string | null;
  cancelled_at: string | null;
  sections: { name: string } | null;
  categories: { name: string } | null;
  stock_count_lines: { counted_at: string | null }[];
};

const COUNT_COLUMNS = `id, number, status, note, created_at, posted_at, cancelled_at,
  sections(name), categories(name), stock_count_lines(counted_at)`;

function toSummary(c: CountRow): CountSummary {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    scope: c.categories
      ? `${c.sections?.name ?? ""} › ${c.categories.name}`
      : (c.sections?.name ?? "Everything"),
    note: c.note,
    createdAt: c.created_at,
    closedAt: c.posted_at ?? c.cancelled_at,
    lines: c.stock_count_lines.length,
    counted: c.stock_count_lines.filter((l) => l.counted_at !== null).length,
  };
}

export async function listCounts(businessId: string): Promise<CountSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .select(COUNT_COLUMNS)
    .eq("business_id", businessId)
    .order("number", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not load stock counts: ${error.message}`);
  return ((data ?? []) as unknown as CountRow[]).map(toSummary);
}

export type CountLine = {
  id: string;
  variantId: string;
  productName: string;
  label: string;
  sku: string;
  unitCode: string;
  allowsDecimal: boolean;
  onHand: string;
  systemQuantity: string | null;
  counted: string | null;
  countedBy: string | null;
};

export async function getCount(businessId: string, countId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .select(COUNT_COLUMNS)
    .eq("business_id", businessId)
    .eq("id", countId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the stock count: ${error.message}`);
  if (!data) return null;

  const { data: lines, error: linesError } = await supabase
    .from("stock_count_lines")
    .select(
      `id, variant_id, system_quantity::text, counted_quantity::text, counted_by,
       product_variants(sku, option_values, stock_levels(on_hand::text),
         products(name, units!products_business_id_base_unit_id_fkey(code, allows_decimal)))`,
    )
    .eq("business_id", businessId)
    .eq("count_id", countId);
  if (linesError) throw new Error(`Could not load the count lines: ${linesError.message}`);

  const people = new Map<string, string>();
  const ids = [
    ...new Set(
      ((lines ?? []) as { counted_by: string | null }[])
        .map((l) => l.counted_by)
        .filter((x): x is string => !!x),
    ),
  ];
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) people.set(p.id, p.full_name || "Unknown");
  }

  const rows = (
    (lines ?? []) as unknown as {
      id: string;
      variant_id: string;
      system_quantity: string | null;
      counted_quantity: string | null;
      counted_by: string | null;
      product_variants: {
        sku: string;
        option_values: string[];
        stock_levels: { on_hand: string } | null;
        products: { name: string; units: { code: string; allows_decimal: boolean } | null };
      };
    }[]
  )
    .map((l): CountLine => ({
      id: l.id,
      variantId: l.variant_id,
      productName: l.product_variants.products.name,
      label: optionsLabel(l.product_variants.option_values),
      sku: l.product_variants.sku,
      unitCode: l.product_variants.products.units?.code ?? "",
      allowsDecimal: l.product_variants.products.units?.allows_decimal ?? false,
      onHand: l.product_variants.stock_levels?.on_hand ?? "0",
      systemQuantity: l.system_quantity,
      counted: l.counted_quantity,
      countedBy: l.counted_by ? (people.get(l.counted_by) ?? "Unknown") : null,
    }))
    .sort(
      (a, b) => a.productName.localeCompare(b.productName) || a.label.localeCompare(b.label, "en"),
    );

  return { count: toSummary(data as unknown as CountRow), lines: rows };
}
