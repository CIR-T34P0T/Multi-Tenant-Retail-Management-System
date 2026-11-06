import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPermissionCode, type PermissionCode } from "./permissions";

/**
 * Server-side permission checks (Data Access Layer pattern).
 *
 * Use these at the start of every Server Action and protected page to give a
 * clear "not allowed" answer early. They are NOT the security boundary:
 * the database re-checks everything with Row-Level Security, so a missing
 * call here can never expose another business's data.
 */

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The signed-in user's permissions in one business (empty if not a member). */
export async function getPermissions(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ReadonlySet<PermissionCode>> {
  const { data, error } = await supabase.rpc("current_user_permissions", {
    p_business: businessId,
  });
  if (error) throw new Error(`Could not load permissions: ${error.message}`);
  const codes = (data ?? []) as unknown[];
  return new Set(
    codes.filter((c): c is PermissionCode => typeof c === "string" && isPermissionCode(c)),
  );
}

/** Throws ForbiddenError unless the user holds every listed permission. */
export async function requirePermission(
  supabase: SupabaseClient,
  businessId: string,
  ...required: PermissionCode[]
): Promise<ReadonlySet<PermissionCode>> {
  const held = await getPermissions(supabase, businessId);
  const missing = required.filter((p) => !held.has(p));
  if (missing.length > 0) throw new ForbiddenError();
  return held;
}

/** Throws ForbiddenError unless the user is an active member of the business. */
export async function requireMembership(supabase: SupabaseClient, businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, currency_code, timezone")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new Error(`Could not load business: ${error.message}`);
  if (!data) throw new ForbiddenError("This business is not available to you.");
  return data;
}
