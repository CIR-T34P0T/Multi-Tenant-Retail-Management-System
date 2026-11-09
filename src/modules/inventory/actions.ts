"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { formatQuantity, parseDecimalInput } from "@/lib/decimal";
import { asNumericInput } from "@/lib/supabase/decimal-column";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/modules/core/business/context";
import { MAX_QUANTITY } from "@/modules/catalog/products/schemas";
import { movementSchema, needsReason, type ManualType } from "./schemas";

/**
 * Server Actions for stock. Each checks permission first for a clear message;
 * the database functions check everything again and are the only way stock
 * can change, so a missing check here could never corrupt the ledger.
 */

const NO_PERMISSION: ActionResult = {
  ok: false,
  message: "You do not have permission to do this.",
};
const NOT_FOUND: ActionResult = {
  ok: false,
  message: "This item no longer exists or you cannot change it. Refresh the page.",
};
const id = z.uuid();
type DbError = { code?: string; message?: string } | null;

/** Messages for the stock rules the database enforces. */
function stockDbError(error: DbError): ActionResult {
  if (error?.code === "RB001") {
    return {
      ok: false,
      message: `${error.message}. This business does not allow stock below zero (Settings › Preferences).`,
      fieldErrors: { quantity: ["More than is in stock"] },
    };
  }
  if (error?.code === "RB002") {
    return { ok: false, confirm: `${error.message}. Record it anyway?` };
  }
  return { ok: false, message: dbErrorMessage(error) };
}

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

const DONE: Record<ManualType, string> = {
  opening: "Opening stock recorded.",
  stock_in: "Stock added.",
  stock_out: "Stock deducted.",
  damaged: "Write-off recorded.",
  expired: "Write-off recorded.",
  missing: "Write-off recorded.",
  written_off: "Write-off recorded.",
};

/** Opening stock, add, deduct and write-offs for one item. */
export async function recordMovement(
  variantId: string,
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = movementSchema.safeParse({
    variantId,
    type: text(form, "type"),
    unitId: text(form, "unitId"),
    quantity: text(form, "quantity"),
    reason: text(form, "reason"),
    confirmNegative: text(form, "confirmNegative") === "yes",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (key === "variantId") return NOT_FOUND;
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;
  const type: ManualType = v.type;

  const ctx = await getAppContext();
  const permission =
    type === "opening" || type === "stock_in" || type === "stock_out"
      ? "inventory.stock.adjust"
      : "inventory.writeoff.record";
  if (!ctx.can(permission)) return NO_PERMISSION;

  const quantity = parseDecimalInput(v.quantity, {
    maxDecimals: 4,
    allowZero: false,
    max: MAX_QUANTITY,
    label: "Quantity",
  });
  if (!quantity.ok) return { ok: false, fieldErrors: { quantity: [quantity.error] } };
  if (needsReason(type) && v.reason === "") {
    return { ok: false, fieldErrors: { reason: ["Say why (for example: broken in delivery)"] } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_stock_movement", {
    p_variant: variantId,
    p_type: type,
    p_unit: v.unitId,
    p_quantity: asNumericInput(quantity.value),
    p_reason: v.reason || undefined,
    p_confirm_negative: v.confirmNegative,
  });
  if (error) {
    const result = stockDbError(error);
    if (error.code === "22023" && /whole numbers|decimal places|quantity/i.test(error.message)) {
      return { ok: false, fieldErrors: { quantity: [error.message] } };
    }
    if (error.code === "22023" && /reason/i.test(error.message)) {
      return { ok: false, fieldErrors: { reason: [error.message] } };
    }
    return result;
  }
  const after = (data as { balance_after?: string } | null)?.balance_after;
  refresh();
  return {
    ok: true,
    message: `${DONE[type]}${after !== undefined ? ` Stock is now ${formatQuantity(after)}.` : ""}`,
  };
}

// ---------------------------------------------------------------- stock counts

export async function startCount(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("inventory.count.post")) return NO_PERMISSION;
  const scope = text(form, "scope"); // "" | "s:<section>" | "c:<category>"
  const section = scope.startsWith("s:") ? scope.slice(2) : undefined;
  const category = scope.startsWith("c:") ? scope.slice(2) : undefined;
  if (
    (section && !id.safeParse(section).success) ||
    (category && !id.safeParse(category).success)
  ) {
    return { ok: false, fieldErrors: { scope: ["Choose what to count"] } };
  }
  const note = text(form, "note").trim();
  if (note.length > 500)
    return { ok: false, fieldErrors: { note: ["Use 500 characters or fewer"] } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_stock_count", {
    p_business: ctx.business.businessId,
    p_section: section,
    p_category: category,
    p_note: note || undefined,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  redirect(`/inventory/counts/${data as string}`);
}

/** Saves what was found on the shelf for one line; an empty box clears it. */
export async function saveCountLine(
  lineId: string,
  raw: string,
  allowsDecimal: boolean,
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("inventory.count.perform") && !ctx.can("inventory.count.post")) return NO_PERMISSION;
  if (!id.safeParse(lineId).success) return NOT_FOUND;
  let value: string | null = null;
  if (raw.trim() !== "") {
    const parsed = parseDecimalInput(raw, {
      maxDecimals: allowsDecimal ? 4 : 0,
      max: MAX_QUANTITY,
      label: "Count",
    });
    if (!parsed.ok) return { ok: false, message: parsed.error };
    value = parsed.value;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_count_line", {
    p_line: lineId,
    p_counted: value === null ? (null as unknown as number) : asNumericInput(value),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function postCount(countId: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("inventory.count.post")) return NO_PERMISSION;
  if (!id.safeParse(countId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_stock_count", { p_count: countId });
  if (error) return stockDbError(error);
  refresh();
  const r = data as { counted: number; adjusted: number };
  return {
    ok: true,
    message: `Count posted: ${r.counted} ${r.counted === 1 ? "item" : "items"} counted, ${r.adjusted} adjusted.`,
  };
}

export async function cancelCount(countId: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("inventory.count.post")) return NO_PERMISSION;
  if (!id.safeParse(countId).success) return NOT_FOUND;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_stock_count", { p_count: countId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Count cancelled. No stock was changed." };
}

/** Reconciliation: every balance against the sum of its movements. */
export async function checkStockRecords(): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("inventory.stock.view")) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_stock_records", {
    p_business: ctx.business.businessId,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const r = data as { checked: number; problems: unknown[] };
  if (r.problems.length === 0) {
    return {
      ok: true,
      message: `All ${r.checked} ${r.checked === 1 ? "item matches" : "items match"} their stock history.`,
    };
  }
  console.error("Stock reconciliation problems", r.problems);
  return {
    ok: false,
    message: `${r.problems.length} of ${r.checked} items do not match their stock history. Please contact support.`,
  };
}
