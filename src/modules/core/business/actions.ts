"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  getModule,
  isOptionalModuleCode,
  withRequirementsInOrder,
  type OptionalModuleCode,
} from "@/modules/registry";
import { fieldErrors, formToObject } from "../auth/schemas";
import { requireUser } from "../session";
import { ACTIVE_BUSINESS_COOKIE } from "./active";
import { activeBusinessCookieOptions, getAppContext, getMemberships } from "./context";
import { countryForCurrency } from "./options";
import { businessDetailsSchema, createBusinessSchema, preferencesSchema } from "./schemas";

async function rememberBusiness(businessId: string) {
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, activeBusinessCookieOptions());
}

// ---------------------------------------------------------------- onboarding

export async function createBusiness(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const parsed = createBusinessSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const modules = formData.getAll("modules").map(String).filter(isOptionalModuleCode);

  const supabase = await createClient();
  const { data: businessId, error } = await supabase.rpc("create_business", {
    p_name: v.name,
    p_slug: v.slug,
    p_timezone: v.timezone,
    p_currency: v.currency,
    p_country: countryForCurrency(v.currency),
  });
  if (error || typeof businessId !== "string") {
    if (error?.code === "23505") {
      return { ok: false, fieldErrors: { slug: ["This address is already taken. Try another."] } };
    }
    return { ok: false, message: dbErrorMessage(error) };
  }

  const details = await supabase
    .from("businesses")
    .update({ phone: v.phone, email: v.email, address: v.address })
    .eq("id", businessId);

  // Switch on the chosen features (and anything they depend on), in a safe order.
  const failed: string[] = [];
  for (const code of withRequirementsInOrder(modules)) {
    const r = await supabase.rpc("set_module_enabled", {
      p_business: businessId,
      p_module: code,
      p_enabled: true,
    });
    if (r.error) failed.push(getModule(code).name);
  }

  await rememberBusiness(businessId);

  if (details.error || failed.length > 0) {
    // The business exists; send the owner to settings to finish rather than failing.
    redirect("/settings?notice=setup-incomplete");
  }
  redirect("/dashboard");
}

export async function acceptInvitation(formData: FormData): Promise<void> {
  await requireUser();
  const memberId = String(formData.get("memberId") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_member: memberId });
  if (error || typeof data !== "string") redirect("/onboarding?notice=invitation-failed");
  await rememberBusiness(data);
  redirect("/dashboard");
}

export async function declineInvitation(formData: FormData): Promise<void> {
  await requireUser();
  const memberId = String(formData.get("memberId") ?? "");
  const supabase = await createClient();
  await supabase.rpc("decline_invitation", { p_member: memberId });
  refresh();
}

// ---------------------------------------------------------- switch business

export async function switchBusiness(formData: FormData): Promise<void> {
  const businessId = String(formData.get("businessId") ?? "");
  const memberships = await getMemberships();
  // The cookie is only a preference; membership is re-checked on every request anyway.
  if (memberships.some((m) => m.businessId === businessId)) await rememberBusiness(businessId);
  redirect("/dashboard");
}

// ------------------------------------------------------------------ settings

export async function updateBusinessDetails(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("core.business.update")) {
    return { ok: false, message: "You do not have permission to change business details." };
  }
  const parsed = businessDetailsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({
      name: v.name,
      legal_name: v.legalName,
      timezone: v.timezone,
      phone: v.phone,
      email: v.email,
      address: v.address,
    })
    .eq("id", ctx.business.businessId)
    .select("id");

  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length)
    return { ok: false, message: "You do not have permission to change business details." };
  refresh();
  return { ok: true, message: "Business details saved." };
}

export async function updatePreferences(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("core.settings.manage")) {
    return { ok: false, message: "You do not have permission to change settings." };
  }
  const parsed = preferencesSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const update: Record<string, unknown> = {
    allow_negative_stock: v.allowNegativeStock,
    low_stock_alerts_enabled: v.lowStockAlertsEnabled,
    receipt_header: v.receiptHeader,
    receipt_footer: v.receiptFooter,
  };
  // Sales settings only change while Sales is on (their fields are hidden otherwise).
  if (ctx.moduleActive("sales")) {
    Object.assign(update, {
      require_customer_on_sale: v.requireCustomerOnSale,
      returns_enabled: v.returnsEnabled,
      max_discount_percent: v.maxDiscountPercent,
      cash_rounding_increment: v.cashRoundingIncrement,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_settings")
    .update(update)
    .eq("business_id", ctx.business.businessId)
    .select("business_id");

  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length)
    return { ok: false, message: "You do not have permission to change settings." };
  return { ok: true, message: "Settings saved." };
}

export async function setModuleEnabled(
  code: OptionalModuleCode,
  enabled: boolean,
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("core.module.manage")) {
    return { ok: false, message: "Only the owner can switch features on or off." };
  }
  if (!isOptionalModuleCode(code)) return { ok: false, message: "Unknown feature." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_module_enabled", {
    p_business: ctx.business.businessId,
    p_module: code,
    p_enabled: enabled,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return {
    ok: true,
    message: `${getModule(code).name} ${enabled ? "switched on" : "switched off. Its records are kept"}.`,
  };
}

/** Same as switchBusiness, callable from a menu item. */
export async function switchBusinessTo(businessId: string): Promise<void> {
  const memberships = await getMemberships();
  if (memberships.some((m) => m.businessId === businessId)) await rememberBusiness(businessId);
  redirect("/dashboard");
}
