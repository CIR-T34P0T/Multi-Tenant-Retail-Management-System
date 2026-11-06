"use server";

import { refresh } from "next/cache";
import { dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formToObject } from "@/modules/core/auth/schemas";
import { getAppContext } from "@/modules/core/business/context";
import { categorySchema, recordIdSchema, sectionSchema } from "./schemas";

/**
 * Server Actions for sections and categories.
 * Each one checks the permission first for a clear message; the database
 * checks again (Row-Level Security), so a missing check could never leak data.
 */

const NO_PERMISSION: ActionResult = {
  ok: false,
  message: "You do not have permission to change sections and categories.",
};
const NOT_FOUND: ActionResult = {
  ok: false,
  message: "This item no longer exists or you cannot change it. Refresh the page.",
};

async function managerContext() {
  const ctx = await getAppContext();
  return ctx.can("catalog.section.manage") ? ctx : null;
}

// ------------------------------------------------------------------- sections

export async function createSection(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await managerContext();
  if (!ctx) return NO_PERMISSION;
  const parsed = sectionSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("sections").insert({
    business_id: ctx.business.businessId,
    name: parsed.data.name,
    description: parsed.data.description,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, fieldErrors: { name: ["A section with this name already exists"] } };
    return { ok: false, message: dbErrorMessage(error) };
  }
  refresh();
  return { ok: true, message: `Section "${parsed.data.name}" created.` };
}

/** One-click creation from the suggestion buttons (name only). */
export async function createSuggestedSection(name: string): Promise<ActionResult> {
  const form = new FormData();
  form.set("name", name);
  form.set("description", "");
  const result = await createSection({ ok: false }, form);
  if (!result.ok && result.fieldErrors?.name)
    return { ok: false, message: result.fieldErrors.name[0] };
  return result;
}

export async function updateSection(
  sectionId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await managerContext();
  if (!ctx) return NO_PERMISSION;
  if (!recordIdSchema.safeParse(sectionId).success) return NOT_FOUND;
  const parsed = sectionSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sections")
    .update({ name: parsed.data.name, description: parsed.data.description })
    .eq("business_id", ctx.business.businessId)
    .eq("id", sectionId)
    .select("id");
  if (error) {
    if (error.code === "23505")
      return { ok: false, fieldErrors: { name: ["A section with this name already exists"] } };
    return { ok: false, message: dbErrorMessage(error) };
  }
  if (!data?.length) return NOT_FOUND;
  refresh();
  return { ok: true, message: "Section saved." };
}

export async function setSectionStatus(
  sectionId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  const ctx = await managerContext();
  if (!ctx) return NO_PERMISSION;
  if (!recordIdSchema.safeParse(sectionId).success) return NOT_FOUND;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sections")
    .update({ status })
    .eq("business_id", ctx.business.businessId)
    .eq("id", sectionId)
    .select("name");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return NOT_FOUND;
  refresh();
  return {
    ok: true,
    message:
      status === "archived"
        ? `"${data[0].name}" archived. It and its categories are hidden until you restore it.`
        : `"${data[0].name}" restored.`,
  };
}

// ----------------------------------------------------------------- categories

export async function createCategory(
  sectionId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await managerContext();
  if (!ctx) return NO_PERMISSION;
  const parsed = categorySchema.safeParse({ ...formToObject(formData), sectionId });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    business_id: ctx.business.businessId,
    section_id: parsed.data.sectionId,
    name: parsed.data.name,
    description: parsed.data.description,
  });
  if (error) {
    if (error.code === "23505")
      return {
        ok: false,
        fieldErrors: { name: ["This section already has a category with this name"] },
      };
    if (error.code === "23503") return NOT_FOUND;
    return { ok: false, message: dbErrorMessage(error) };
  }
  refresh();
  return { ok: true, message: `Category "${parsed.data.name}" added.` };
}

export async function updateCategory(
  categoryId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await managerContext();
  if (!ctx) return NO_PERMISSION;
  if (!recordIdSchema.safeParse(categoryId).success) return NOT_FOUND;
  const parsed = categorySchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      section_id: parsed.data.sectionId,
    })
    .eq("business_id", ctx.business.businessId)
    .eq("id", categoryId)
    .select("id");
  if (error) {
    if (error.code === "23505")
      return {
        ok: false,
        fieldErrors: { name: ["The chosen section already has a category with this name"] },
      };
    if (error.code === "23503") return NOT_FOUND;
    return { ok: false, message: dbErrorMessage(error) };
  }
  if (!data?.length) return NOT_FOUND;
  refresh();
  return { ok: true, message: "Category saved." };
}

export async function setCategoryStatus(
  categoryId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  const ctx = await managerContext();
  if (!ctx) return NO_PERMISSION;
  if (!recordIdSchema.safeParse(categoryId).success) return NOT_FOUND;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .update({ status })
    .eq("business_id", ctx.business.businessId)
    .eq("id", categoryId)
    .select("name");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return NOT_FOUND;
  refresh();
  return {
    ok: true,
    message: status === "archived" ? `"${data[0].name}" archived.` : `"${data[0].name}" restored.`,
  };
}
