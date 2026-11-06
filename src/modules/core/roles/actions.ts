"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { PERMISSIONS, isPermissionCode } from "@/lib/authz/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formToObject } from "../auth/schemas";
import { getAppContext } from "../business/context";

const roleNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Enter a role name" })
    .max(60, { error: "Name is too long" }),
});

function keyFromName(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(base) ? base : `role_${base}`).slice(0, 40).replace(/_+$/, "") || "role";
}

export async function createRole(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("core.role.manage"))
    return { ok: false, message: "Only the owner can manage roles." };
  const parsed = roleNameSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({
    business_id: ctx.business.businessId,
    key: keyFromName(parsed.data.name),
    name: parsed.data.name,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, fieldErrors: { name: ["A role with this name already exists"] } };
    return { ok: false, message: dbErrorMessage(error) };
  }
  refresh();
  return { ok: true, message: `Role "${parsed.data.name}" created. Choose its permissions below.` };
}

/**
 * Sets a role's permissions for the features that are switched on.
 * Permissions belonging to switched-off features are left untouched (they are
 * not shown in the editor, so they must not be removed by saving it).
 */
export async function updateRolePermissions(
  roleId: string,
  codes: string[],
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.can("core.role.manage"))
    return { ok: false, message: "Only the owner can manage roles." };
  const wanted = new Set<string>(codes.filter(isPermissionCode));

  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from("role_permissions")
    .select("permission_code")
    .eq("business_id", ctx.business.businessId)
    .eq("role_id", roleId);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  const have = new Set((current ?? []).map((r: { permission_code: string }) => r.permission_code));
  const toAdd = [...wanted].filter(
    (c) =>
      !have.has(c) && ctx.moduleActive(PERMISSIONS[c as keyof typeof PERMISSIONS].module as never),
  );
  const editable = (code: string) =>
    isPermissionCode(code) && ctx.moduleActive(PERMISSIONS[code].module as never);
  const toRemove = [...have].filter((c) => !wanted.has(c) && editable(c));

  if (toRemove.length) {
    const r = await supabase
      .from("role_permissions")
      .delete()
      .eq("business_id", ctx.business.businessId)
      .eq("role_id", roleId)
      .in("permission_code", toRemove);
    if (r.error) return { ok: false, message: dbErrorMessage(r.error) };
  }
  if (toAdd.length) {
    const r = await supabase.from("role_permissions").insert(
      toAdd.map((code) => ({
        business_id: ctx.business.businessId,
        role_id: roleId,
        permission_code: code,
      })),
    );
    if (r.error) return { ok: false, message: dbErrorMessage(r.error) };
  }
  refresh();
  return {
    ok: true,
    message: "Permissions saved. They apply to everyone with this role immediately.",
  };
}
