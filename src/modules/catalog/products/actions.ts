"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { parseDecimalInput } from "@/lib/decimal";
import { asNumericInput } from "@/lib/supabase/decimal-column";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/modules/core/business/context";
import { checkImage, productImagePath } from "./image-file";
import { deleteProductImage, uploadProductImage } from "./images";
import { takenSkus } from "./queries";
import {
  costRule,
  factorRule,
  idSchema,
  issuesToFieldErrors,
  newProductSchema,
  optionalDecimal,
  priceRule,
  productDetailsSchema,
  quantityRule,
  variantEditSchema,
  type NewProductInput,
} from "./schemas";
import { suggestSku, uniqueSku, variantKey } from "./variants";

/**
 * Server Actions for products. Each checks permission first for a clear
 * message; the database checks again (Row-Level Security and its own
 * functions), so a missing check here could never leak or corrupt data.
 */

type DbError = { code?: string; message?: string } | null;

const NO_PERMISSION: ActionResult = {
  ok: false,
  message: "You do not have permission to do this.",
};
const NOT_FOUND: ActionResult = {
  ok: false,
  message: "This item no longer exists or you cannot change it. Refresh the page.",
};

/** Plain-language messages for the database's uniqueness and link rules. */
function productDbError(error: DbError): ActionResult {
  const m = error?.message ?? "";
  if (error?.code === "23505") {
    if (m.includes("product_variants_business_sku_key"))
      return {
        ok: false,
        fieldErrors: { sku: ["This product code is already used"] },
        message: "A product code (SKU) is already used. Choose another.",
      };
    if (m.includes("product_variants_business_barcode_key"))
      return {
        ok: false,
        fieldErrors: { barcode: ["This barcode is already used"] },
        message: "A barcode is already used by another product.",
      };
    if (m.includes("product_variants_product_options_key"))
      return { ok: false, message: "A variant with these options already exists." };
    if (m.includes("product_units_product_id_unit_id_key"))
      return { ok: false, fieldErrors: { unitId: ["This product already uses that unit"] } };
    if (m.includes("units_business_id_code_key"))
      return { ok: false, fieldErrors: { code: ["This symbol is already used"] } };
    if (m.includes("units_business_name_key"))
      return { ok: false, fieldErrors: { name: ["A unit with this name already exists"] } };
    if (m.includes("current_key"))
      return {
        ok: false,
        message: "Someone else changed this price at the same moment. Refresh and try again.",
      };
  }
  if (error?.code === "23503")
    return {
      ok: false,
      message: "A section, category or unit you chose is no longer available. Refresh the page.",
    };
  return { ok: false, message: dbErrorMessage(error) };
}

async function context() {
  const ctx = await getAppContext();
  return {
    ctx,
    businessId: ctx.business.businessId,
    canManage: ctx.can("catalog.product.manage"),
    canPrice: ctx.can("pricing.price.update"),
    canCost: ctx.can("pricing.price.update") && ctx.can("inventory.cost.view"),
  };
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

async function unitAllowsDecimal(businessId: string, unitId: string): Promise<boolean | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("units")
    .select("allows_decimal")
    .eq("business_id", businessId)
    .eq("id", unitId)
    .maybeSingle();
  return data ? data.allows_decimal : null;
}

// ------------------------------------------------------------- create product

export async function createProduct(
  input: NewProductInput,
): Promise<ActionResult & { productId?: string }> {
  const { businessId, canManage, canPrice, canCost } = await context();
  if (!canManage) return NO_PERMISSION;

  const parsed = newProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: issuesToFieldErrors(parsed.error),
    };
  }
  const p = parsed.data;

  const baseDecimal = await unitAllowsDecimal(businessId, p.baseUnitId);
  if (baseDecimal === null) return { ok: false, fieldErrors: { baseUnitId: ["Choose a unit"] } };

  const errors: Record<string, string[]> = {};
  const fail = (key: string, message: string) => (errors[key] ??= []).push(message);

  // Every variant must give one value per option, with no repeated combination.
  const optionCount = p.options.length;
  const seen = new Set<string>();
  p.variants.forEach((v, i) => {
    if (v.optionValues.length !== optionCount)
      fail(`variants.${i}`, "Give a value for every option");
    const key = variantKey(v.optionValues);
    if (seen.has(key)) fail(`variants.${i}`, "This combination is listed twice");
    seen.add(key);
  });

  const unitIds = new Set<string>([p.baseUnitId]);
  const extraUnits = p.extraUnits.map((u, i) => {
    if (unitIds.has(u.unitId)) fail(`extraUnits.${i}.unitId`, "This unit is already used");
    unitIds.add(u.unitId);
    const factor = parseDecimalInput(u.factor, factorRule(baseDecimal));
    if (!factor.ok) fail(`extraUnits.${i}.factor`, factor.error);
    const price = canPrice
      ? optionalDecimal(u.price, priceRule)
      : { ok: true as const, value: null };
    if (!price.ok) fail(`extraUnits.${i}.price`, price.error);
    return {
      unitId: u.unitId,
      factor: factor.ok ? factor.value : "1",
      price: price.ok ? price.value : null,
    };
  });

  // Product codes: keep the ones typed, suggest the rest without clashing.
  const suggestions = p.variants.map((v) => v.sku || suggestSku(p.name, v.optionValues));
  const taken = await takenSkus(businessId, suggestions);
  const batch = new Set<string>();
  const variants = p.variants.map((v, i) => {
    let sku = v.sku;
    if (!sku) sku = uniqueSku(suggestions[i], new Set([...taken, ...batch]));
    if (batch.has(sku.toUpperCase())) fail(`variants.${i}.sku`, "This product code is used twice");
    batch.add(sku.toUpperCase());

    const price = canPrice
      ? optionalDecimal(v.price, priceRule)
      : { ok: true as const, value: null };
    if (!price.ok) fail(`variants.${i}.price`, price.error);
    const cost = canCost ? optionalDecimal(v.cost, costRule) : { ok: true as const, value: null };
    if (!cost.ok) fail(`variants.${i}.cost`, cost.error);
    const minStock = optionalDecimal(v.minStock, quantityRule(baseDecimal, "Minimum stock"));
    if (!minStock.ok) fail(`variants.${i}.minStock`, minStock.error);

    const prices: { unit_id: string; price: string }[] = [];
    if (price.ok && price.value !== null)
      prices.push({ unit_id: p.baseUnitId, price: price.value });
    for (const u of extraUnits)
      if (u.price !== null) prices.push({ unit_id: u.unitId, price: u.price });

    return {
      sku,
      barcode: v.barcode || null,
      option_values: v.optionValues,
      min_stock_level: minStock.ok && minStock.value !== null ? minStock.value : "0",
      prices,
      cost: cost.ok ? cost.value : null,
    };
  });

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: errors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_product", {
    p_business: businessId,
    p_product: {
      section_id: p.sectionId,
      category_id: p.categoryId,
      name: p.name,
      brand: p.brand,
      description: p.description,
      base_unit_id: p.baseUnitId,
      option_names: p.options.map((o) => o.name),
      units: extraUnits.map((u) => ({ unit_id: u.unitId, factor: u.factor })),
      variants,
    },
  });
  if (error) return productDbError(error);
  refresh();
  return { ok: true, message: `Product "${p.name}" created.`, productId: data as string };
}

// ------------------------------------------------------------ product details

export async function updateProductDetails(
  productId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productId).success) return NOT_FOUND;

  const parsed = productDetailsSchema.safeParse({
    name: field(form, "name"),
    brand: field(form, "brand"),
    description: field(form, "description"),
    sectionId: field(form, "sectionId"),
    categoryId: field(form, "categoryId"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };

  const optionNames = form.getAll("optionName").map((v) => String(v).trim());
  if (optionNames.some((n) => n === "" || n.length > 30)) {
    return { ok: false, fieldErrors: { optionName: ["Option names must be 1 to 30 characters"] } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      brand: parsed.data.brand,
      description: parsed.data.description,
      section_id: parsed.data.sectionId,
      category_id: parsed.data.categoryId,
      ...(optionNames.length > 0 ? { option_names: optionNames } : {}),
    })
    .eq("business_id", businessId)
    .eq("id", productId)
    .select("id");
  if (error) return productDbError(error);
  if (!data?.length) return NOT_FOUND;
  refresh();
  return { ok: true, message: "Product saved." };
}

export async function setProductStatus(
  productId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", productId)
    .select("name");
  if (error) return productDbError(error);
  if (!data?.length) return NOT_FOUND;
  refresh();
  return {
    ok: true,
    message: status === "archived" ? `"${data[0].name}" archived.` : `"${data[0].name}" restored.`,
  };
}

// ------------------------------------------------------------------- variants

async function loadProductForVariant(businessId: string, productId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, name, base_unit_id, option_names, units!products_business_id_base_unit_id_fkey(allows_decimal)",
    )
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
  return data as unknown as {
    id: string;
    name: string;
    base_unit_id: string;
    option_names: string[];
    units: { allows_decimal: boolean };
  } | null;
}

export async function addVariant(
  productId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { businessId, canManage, canPrice, canCost } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productId).success) return NOT_FOUND;
  const product = await loadProductForVariant(businessId, productId);
  if (!product) return NOT_FOUND;

  const parsed = variantEditSchema.safeParse({
    sku: field(form, "sku"),
    barcode: field(form, "barcode"),
    minStock: field(form, "minStock"),
    optionValues: form.getAll("optionValue").map(String),
  });
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };
  if (parsed.data.optionValues.length !== product.option_names.length) {
    return { ok: false, fieldErrors: { optionValues: ["Give a value for every option"] } };
  }

  const errors: Record<string, string[]> = {};
  const minStock = optionalDecimal(
    parsed.data.minStock,
    quantityRule(product.units.allows_decimal, "Minimum stock"),
  );
  if (!minStock.ok) errors.minStock = [minStock.error];
  const price = canPrice
    ? optionalDecimal(field(form, "price"), priceRule)
    : { ok: true as const, value: null };
  if (!price.ok) errors.price = [price.error];
  const cost = canCost
    ? optionalDecimal(field(form, "cost"), costRule)
    : { ok: true as const, value: null };
  if (!cost.ok) errors.cost = [cost.error];
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  let sku = parsed.data.sku;
  if (!sku) {
    const suggestion = suggestSku(product.name, parsed.data.optionValues);
    sku = uniqueSku(suggestion, await takenSkus(businessId, [suggestion]));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_product_variant", {
    p_product: productId,
    p_variant: {
      sku,
      barcode: parsed.data.barcode || null,
      option_values: parsed.data.optionValues,
      min_stock_level: minStock.ok && minStock.value !== null ? minStock.value : "0",
      prices:
        price.ok && price.value !== null
          ? [{ unit_id: product.base_unit_id, price: price.value }]
          : [],
      cost: cost.ok ? cost.value : null,
    },
  });
  if (error) return productDbError(error);
  refresh();
  return { ok: true, message: `Variant ${sku} added.` };
}

export async function updateVariant(
  variantId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(variantId).success) return NOT_FOUND;

  const parsed = variantEditSchema.safeParse({
    sku: field(form, "sku"),
    barcode: field(form, "barcode"),
    minStock: field(form, "minStock"),
    optionValues: form.getAll("optionValue").map(String),
  });
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };
  if (!parsed.data.sku) return { ok: false, fieldErrors: { sku: ["Enter a product code"] } };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("business_id", businessId)
    .eq("id", variantId)
    .maybeSingle();
  if (!current) return NOT_FOUND;
  const product = await loadProductForVariant(businessId, current.product_id);
  if (!product) return NOT_FOUND;
  const minStock = optionalDecimal(
    parsed.data.minStock,
    quantityRule(product.units.allows_decimal, "Minimum stock"),
  );
  if (!minStock.ok) return { ok: false, fieldErrors: { minStock: [minStock.error] } };

  const { data, error } = await supabase
    .from("product_variants")
    .update({
      sku: parsed.data.sku,
      barcode: parsed.data.barcode || null,
      option_values: parsed.data.optionValues,
      min_stock_level: asNumericInput(minStock.value ?? "0"),
    })
    .eq("business_id", businessId)
    .eq("id", variantId)
    .select("id");
  if (error) return productDbError(error);
  if (!data?.length) return NOT_FOUND;
  refresh();
  return { ok: true, message: "Variant saved." };
}

export async function setVariantStatus(
  variantId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(variantId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", variantId)
    .select("sku");
  if (error) return productDbError(error);
  if (!data?.length) return NOT_FOUND;
  refresh();
  return {
    ok: true,
    message: status === "archived" ? `${data[0].sku} archived.` : `${data[0].sku} restored.`,
  };
}

// ---------------------------------------------------------------------- units

export async function addProductUnit(
  productId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { businessId, canManage, canPrice } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productId).success) return NOT_FOUND;
  const unitId = field(form, "unitId");
  if (!idSchema.safeParse(unitId).success)
    return { ok: false, fieldErrors: { unitId: ["Choose a unit"] } };
  const product = await loadProductForVariant(businessId, productId);
  if (!product) return NOT_FOUND;

  const factor = parseDecimalInput(field(form, "factor"), factorRule(product.units.allows_decimal));
  if (!factor.ok) return { ok: false, fieldErrors: { factor: [factor.error] } };
  const price = canPrice
    ? optionalDecimal(field(form, "price"), priceRule)
    : { ok: true as const, value: null };
  if (!price.ok) return { ok: false, fieldErrors: { price: [price.error] } };

  const supabase = await createClient();
  const { error } = await supabase.from("product_units").insert({
    business_id: businessId,
    product_id: productId,
    unit_id: unitId,
    factor: asNumericInput(factor.value),
  });
  if (error) return productDbError(error);

  // Optional: same price in this unit for every active variant.
  if (price.value !== null) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id")
      .eq("business_id", businessId)
      .eq("product_id", productId)
      .eq("status", "active");
    for (const v of variants ?? []) {
      const { error: priceError } = await supabase.rpc("set_variant_price", {
        p_variant: v.id,
        p_unit: unitId,
        p_price: asNumericInput(price.value),
      });
      if (priceError) {
        refresh();
        return {
          ok: false,
          message: `The unit was added, but not every price could be set: ${dbErrorMessage(priceError)}`,
        };
      }
    }
  }
  refresh();
  return { ok: true, message: "Unit added." };
}

export async function updateProductUnitFactor(
  productUnitId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productUnitId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("product_units")
    .select("product_id")
    .eq("business_id", businessId)
    .eq("id", productUnitId)
    .maybeSingle();
  if (!row) return NOT_FOUND;
  const product = await loadProductForVariant(businessId, row.product_id);
  if (!product) return NOT_FOUND;
  const factor = parseDecimalInput(field(form, "factor"), factorRule(product.units.allows_decimal));
  if (!factor.ok) return { ok: false, fieldErrors: { factor: [factor.error] } };
  const { data, error } = await supabase
    .from("product_units")
    .update({ factor: asNumericInput(factor.value) })
    .eq("business_id", businessId)
    .eq("id", productUnitId)
    .select("id");
  if (error) return productDbError(error);
  if (!data?.length) return NOT_FOUND;
  refresh();
  return { ok: true, message: "Unit saved." };
}

export async function setProductUnitStatus(
  productUnitId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productUnitId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_units")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", productUnitId)
    .select("id");
  if (error) return productDbError(error);
  if (!data?.length) return NOT_FOUND;
  refresh();
  return { ok: true, message: status === "archived" ? "Unit archived." : "Unit restored." };
}

// ------------------------------------------------------------- prices & costs

export async function setPrice(
  variantId: string,
  unitId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { canPrice } = await context();
  if (!canPrice) return NO_PERMISSION;
  if (!idSchema.safeParse(variantId).success || !idSchema.safeParse(unitId).success)
    return NOT_FOUND;
  const price = parseDecimalInput(field(form, "price"), priceRule);
  if (!price.ok) return { ok: false, fieldErrors: { price: [price.error] } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_variant_price", {
    p_variant: variantId,
    p_unit: unitId,
    p_price: asNumericInput(price.value),
  });
  if (error) return productDbError(error);
  refresh();
  return { ok: true, message: "Price saved." };
}

export async function setCost(
  variantId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { canCost } = await context();
  if (!canCost) return NO_PERMISSION;
  if (!idSchema.safeParse(variantId).success) return NOT_FOUND;
  const cost = parseDecimalInput(field(form, "cost"), costRule);
  if (!cost.ok) return { ok: false, fieldErrors: { cost: [cost.error] } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_variant_cost", {
    p_variant: variantId,
    p_cost: asNumericInput(cost.value),
  });
  if (error) return productDbError(error);
  refresh();
  return { ok: true, message: "Cost saved." };
}

// --------------------------------------------------------------------- images

export async function uploadImage(
  productId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productId).success) return NOT_FOUND;

  const file = form.get("image");
  if (!(file instanceof File))
    return { ok: false, fieldErrors: { image: ["Choose an image file"] } };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = checkImage(file.size, head);
  if (!check.ok) return { ok: false, fieldErrors: { image: [check.error] } };

  // Prove the user may edit THIS product (Row-Level Security) before using storage.
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, image_path")
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
  if (!product) return NOT_FOUND;

  const path = productImagePath(businessId, productId, randomUUID(), check.kind.ext);
  try {
    await uploadProductImage(path, file, check.kind.mime);
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      message: "The image could not be stored right now. Please try again later.",
    };
  }
  const { data, error } = await supabase
    .from("products")
    .update({ image_path: path })
    .eq("business_id", businessId)
    .eq("id", productId)
    .select("id");
  if (error || !data?.length) {
    await deleteProductImage(path);
    return error ? productDbError(error) : NO_PERMISSION;
  }
  if (product.image_path) await deleteProductImage(product.image_path);
  refresh();
  return { ok: true, message: "Image saved." };
}

export async function removeImage(productId: string): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(productId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("image_path")
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
  if (!product) return NOT_FOUND;
  const { data, error } = await supabase
    .from("products")
    .update({ image_path: null })
    .eq("business_id", businessId)
    .eq("id", productId)
    .select("id");
  if (error) return productDbError(error);
  if (!data?.length) return NO_PERMISSION;
  if (product.image_path) await deleteProductImage(product.image_path);
  refresh();
  return { ok: true, message: "Image removed." };
}

// --------------------------------------------------------- business units list

export async function createUnit(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  const name = field(form, "name").replace(/\s+/g, " ").trim();
  const code = field(form, "code").trim().toLowerCase();
  const kind = field(form, "kind");
  const errors: Record<string, string[]> = {};
  if (!name || name.length > 40) errors.name = ["Enter a name of up to 40 characters"];
  if (!/^[a-z][a-z0-9]{0,11}$/.test(code))
    errors.code = ["Use 1–12 lowercase letters or digits, starting with a letter"];
  if (!["count", "mass", "volume", "length", "other"].includes(kind))
    errors.kind = ["Choose a kind"];
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  const supabase = await createClient();
  const { error } = await supabase.from("units").insert({
    business_id: businessId,
    name,
    code,
    kind,
    allows_decimal: form.get("allowsDecimal") === "on",
  });
  if (error) return productDbError(error);
  refresh();
  return { ok: true, message: `Unit "${name}" added.` };
}

export async function setUnitStatus(
  unitId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  const { businessId, canManage } = await context();
  if (!canManage) return NO_PERMISSION;
  if (!idSchema.safeParse(unitId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", unitId)
    .select("name");
  if (error) return productDbError(error);
  if (!data?.length) return NOT_FOUND;
  refresh();
  return {
    ok: true,
    message: status === "archived" ? `"${data[0].name}" archived.` : `"${data[0].name}" restored.`,
  };
}
