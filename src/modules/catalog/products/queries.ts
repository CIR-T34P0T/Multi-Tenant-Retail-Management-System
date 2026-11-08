import "server-only";
import { toDecimal } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { signedImageUrls } from "./images";
import { PAGE_SIZE, type ProductListFilter } from "./schemas";

/**
 * Reads for the product screens. All queries run as the signed-in user, so
 * Row-Level Security decides what comes back (e.g. cost prices are simply
 * absent for people without permission). Decimal columns are read as text.
 */

export type Status = "active" | "archived";

export type UnitOption = {
  id: string;
  code: string;
  name: string;
  kind: string;
  allowsDecimal: boolean;
  status: Status;
};

export type SectionChoice = {
  id: string;
  name: string;
  categories: { id: string; name: string }[];
};

/** Active sections (with active categories) and all units of the business. */
export async function getCatalogChoices(businessId: string) {
  const supabase = await createClient();
  const [sections, categories, units] = await Promise.all([
    supabase
      .from("sections")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, section_id")
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("units")
      .select("id, code, name, kind, allows_decimal, status")
      .eq("business_id", businessId)
      .order("name"),
  ]);
  for (const r of [sections, categories, units]) {
    if (r.error) throw new Error(`Could not load catalogue choices: ${r.error.message}`);
  }
  const sectionChoices: SectionChoice[] = (sections.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    categories: (categories.data ?? [])
      .filter((c) => c.section_id === s.id)
      .map((c) => ({ id: c.id, name: c.name })),
  }));
  const unitOptions: UnitOption[] = (units.data ?? []).map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    kind: u.kind,
    allowsDecimal: u.allows_decimal,
    status: u.status as Status,
  }));
  return { sections: sectionChoices, units: unitOptions };
}

// ---------------------------------------------------------------- product list

export type ProductListRow = {
  id: string;
  name: string;
  brand: string;
  status: Status;
  sectionName: string;
  categoryName: string | null;
  baseUnitCode: string;
  activeVariants: number;
  /** Lowest current price in the base unit, as an exact decimal string. */
  priceFrom: string | null;
  priceTo: string | null;
};

export async function listProducts(
  businessId: string,
  filter: ProductListFilter,
  options: { withPrices: boolean },
): Promise<{ rows: ProductListRow[]; total: number }> {
  const supabase = await createClient();

  // A search also matches product codes (SKU) and barcodes, which live on variants.
  let matchingIds: string[] = [];
  if (filter.q) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("product_id")
      .eq("business_id", businessId)
      .or(`sku.ilike.*${filter.q}*,barcode.ilike.*${filter.q}*`)
      .limit(500);
    if (error) throw new Error(`Could not search products: ${error.message}`);
    matchingIds = [...new Set((data ?? []).map((v) => v.product_id))];
  }

  let query = supabase
    .from("products")
    .select(
      "id, name, brand, status, sections(name), categories(name), units!products_business_id_base_unit_id_fkey(code)",
      { count: "exact" },
    )
    .eq("business_id", businessId);
  if (filter.status !== "all") query = query.eq("status", filter.status);
  if (filter.sectionId) query = query.eq("section_id", filter.sectionId);
  if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
  if (filter.q) {
    const terms = [`name.ilike.*${filter.q}*`, `brand.ilike.*${filter.q}*`];
    if (matchingIds.length > 0) terms.push(`id.in.(${matchingIds.join(",")})`);
    query = query.or(terms.join(","));
  }
  const from = (filter.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.order("name").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Could not load products: ${error.message}`);

  const products = (data ?? []) as unknown as {
    id: string;
    name: string;
    brand: string;
    status: Status;
    sections: { name: string } | null;
    categories: { name: string } | null;
    units: { code: string } | null;
  }[];
  const ids = products.map((p) => p.id);

  const variantsByProduct = new Map<string, string[]>();
  const pricesByProduct = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: variants, error: vErr } = await supabase
      .from("product_variants")
      .select("id, product_id")
      .in("product_id", ids)
      .eq("status", "active");
    if (vErr) throw new Error(`Could not load variants: ${vErr.message}`);
    for (const v of variants ?? []) {
      variantsByProduct.set(v.product_id, [...(variantsByProduct.get(v.product_id) ?? []), v.id]);
    }

    if (options.withPrices && (variants ?? []).length > 0) {
      const variantProduct = new Map((variants ?? []).map((v) => [v.id, v.product_id]));
      const { data: prices, error: pErr } = await supabase
        .from("variant_prices")
        .select(
          "variant_id, unit_id, price::text, product_variants!inner(products!inner(base_unit_id))",
        )
        .in("variant_id", [...variantProduct.keys()])
        .is("effective_to", null);
      if (pErr) throw new Error(`Could not load prices: ${pErr.message}`);
      for (const p of (prices ?? []) as unknown as {
        variant_id: string;
        unit_id: string;
        price: string;
        product_variants: { products: { base_unit_id: string } };
      }[]) {
        if (p.unit_id !== p.product_variants.products.base_unit_id) continue;
        const productId = variantProduct.get(p.variant_id)!;
        pricesByProduct.set(productId, [...(pricesByProduct.get(productId) ?? []), p.price]);
      }
    }
  }

  const rows = products.map((p) => {
    const prices = (pricesByProduct.get(p.id) ?? []).sort((a, b) => toDecimal(a).cmp(toDecimal(b)));
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      status: p.status,
      sectionName: p.sections?.name ?? "",
      categoryName: p.categories?.name ?? null,
      baseUnitCode: p.units?.code ?? "",
      activeVariants: variantsByProduct.get(p.id)?.length ?? 0,
      priceFrom: prices[0] ?? null,
      priceTo: prices.at(-1) ?? null,
    };
  });
  return { rows, total: count ?? rows.length };
}

// -------------------------------------------------------------- product detail

export type ProductDetail = Awaited<ReturnType<typeof getProductDetail>>;

export type PriceEntry = {
  variantId: string;
  unitId: string;
  price: string;
  from: string;
  to: string | null;
  setBy: string;
};
export type CostEntry = {
  variantId: string;
  cost: string;
  from: string;
  to: string | null;
  setBy: string;
};

export async function getProductDetail(businessId: string, productId: string) {
  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id, name, brand, description, status, section_id, category_id, base_unit_id, option_names, image_path, sections(name, status), categories(name)",
    )
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(`Could not load product: ${error.message}`);
  if (!product) return null;

  const [variants, productUnits] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, sku, barcode, option_values, min_stock_level::text, status")
      .eq("business_id", businessId)
      .eq("product_id", productId)
      .order("created_at"),
    supabase
      .from("product_units")
      .select("id, unit_id, factor::text, is_base, status, units(code, name, allows_decimal)")
      .eq("business_id", businessId)
      .eq("product_id", productId),
  ]);
  if (variants.error) throw new Error(`Could not load variants: ${variants.error.message}`);
  if (productUnits.error) throw new Error(`Could not load units: ${productUnits.error.message}`);

  const variantIds = (variants.data ?? []).map((v) => v.id);
  const [prices, costs] = variantIds.length
    ? await Promise.all([
        supabase
          .from("variant_prices")
          .select("variant_id, unit_id, price::text, effective_from, effective_to, set_by")
          .in("variant_id", variantIds)
          .order("effective_from", { ascending: false })
          .limit(1000),
        supabase
          .from("variant_costs")
          .select("variant_id, cost::text, effective_from, effective_to, set_by")
          .in("variant_id", variantIds)
          .order("effective_from", { ascending: false })
          .limit(1000),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (prices.error) throw new Error(`Could not load prices: ${prices.error.message}`);
  if (costs.error) throw new Error(`Could not load costs: ${costs.error.message}`);

  // Names of the people who set prices (teammates' profiles are visible to members).
  const people = new Set<string>();
  for (const r of [...(prices.data ?? []), ...(costs.data ?? [])])
    if (r.set_by) people.add(r.set_by);
  const names = new Map<string, string>();
  if (people.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...people]);
    for (const p of profiles ?? []) names.set(p.id, p.full_name || "Unnamed");
  }

  const imageUrl = product.image_path
    ? ((await signedImageUrls([product.image_path])).get(product.image_path) ?? null)
    : null;

  const units = (
    (productUnits.data ?? []) as unknown as {
      id: string;
      unit_id: string;
      factor: string;
      is_base: boolean;
      status: Status;
      units: { code: string; name: string; allows_decimal: boolean };
    }[]
  )
    .map((u) => ({
      id: u.id,
      unitId: u.unit_id,
      code: u.units.code,
      name: u.units.name,
      allowsDecimal: u.units.allows_decimal,
      factor: u.factor,
      isBase: u.is_base,
      status: u.status,
    }))
    .sort(
      (a, b) => Number(b.isBase) - Number(a.isBase) || toDecimal(a.factor).cmp(toDecimal(b.factor)),
    );

  const p = product as unknown as typeof product & {
    sections: { name: string; status: Status } | null;
    categories: { name: string } | null;
  };

  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    description: p.description,
    status: p.status as Status,
    sectionId: p.section_id,
    sectionName: p.sections?.name ?? "",
    categoryId: p.category_id,
    categoryName: p.categories?.name ?? null,
    baseUnitId: p.base_unit_id,
    optionNames: p.option_names,
    imageUrl,
    hasImage: Boolean(p.image_path),
    units,
    variants: (variants.data ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      optionValues: v.option_values,
      minStock: (v as unknown as { min_stock_level: string }).min_stock_level,
      status: v.status as Status,
    })),
    prices: (
      (prices.data ?? []) as unknown as {
        variant_id: string;
        unit_id: string;
        price: string;
        effective_from: string;
        effective_to: string | null;
        set_by: string | null;
      }[]
    ).map<PriceEntry>((r) => ({
      variantId: r.variant_id,
      unitId: r.unit_id,
      price: r.price,
      from: r.effective_from,
      to: r.effective_to,
      setBy: (r.set_by && names.get(r.set_by)) || "Unknown",
    })),
    costs: (
      (costs.data ?? []) as unknown as {
        variant_id: string;
        cost: string;
        effective_from: string;
        effective_to: string | null;
        set_by: string | null;
      }[]
    ).map<CostEntry>((r) => ({
      variantId: r.variant_id,
      cost: r.cost,
      from: r.effective_from,
      to: r.effective_to,
      setBy: (r.set_by && names.get(r.set_by)) || "Unknown",
    })),
  };
}

/** SKUs already used in the business that start with any of the given prefixes. */
export async function takenSkus(businessId: string, prefixes: string[]): Promise<Set<string>> {
  const supabase = await createClient();
  const unique = [...new Set(prefixes.map((p) => p.split("-")[0]).filter(Boolean))];
  if (unique.length === 0) return new Set();
  const { data, error } = await supabase
    .from("product_variants")
    .select("sku")
    .eq("business_id", businessId)
    .or(unique.map((p) => `sku.ilike.${p}*`).join(","))
    .limit(5000);
  if (error) throw new Error(`Could not check product codes: ${error.message}`);
  return new Set((data ?? []).map((v) => v.sku.toUpperCase()));
}
