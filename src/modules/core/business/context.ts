import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPermissionCode, type PermissionCode } from "@/lib/authz/permissions";
import {
  OPTIONAL_MODULES,
  isModuleActive,
  type ModuleCode,
  type OptionalModuleCode,
} from "@/modules/registry";
import { requireUser, type SessionUser } from "../session";
import { ACTIVE_BUSINESS_COOKIE, chooseActiveBusiness, type MembershipSummary } from "./active";

export type ActiveBusiness = MembershipSummary & {
  currencyCode: string;
  timezone: string;
};

export type AppContext = {
  user: SessionUser;
  fullName: string;
  business: ActiveBusiness;
  memberships: MembershipSummary[];
  roleName: string;
  isOwner: boolean;
  permissions: ReadonlySet<PermissionCode>;
  enabledModules: ReadonlySet<OptionalModuleCode>;
  can: (permission: PermissionCode) => boolean;
  moduleActive: (code: ModuleCode) => boolean;
};

/** Businesses the signed-in user belongs to (RLS returns only those). */
export const getMemberships = cache(async (): Promise<MembershipSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("businesses").select("id, name, slug").order("name");
  if (error) throw new Error(`Could not load businesses: ${error.message}`);
  return (data ?? []).map((b: { id: string; name: string; slug: string }) => ({
    businessId: b.id,
    name: b.name,
    slug: b.slug,
  }));
});

/**
 * Everything a signed-in screen needs: user, active business, role,
 * permissions and enabled modules. One set of queries per request.
 * Redirects to sign-in (no session) or onboarding (no business).
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const user = await requireUser();
  const memberships = await getMemberships();
  const cookieStore = await cookies();
  const active = chooseActiveBusiness(memberships, cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value);
  if (!active) redirect("/onboarding");

  const supabase = await createClient();
  const [business, permissions, modules, profile, member] = await Promise.all([
    supabase
      .from("businesses")
      .select("currency_code, timezone")
      .eq("id", active.businessId)
      .single(),
    supabase.rpc("current_user_permissions", { p_business: active.businessId }),
    supabase
      .from("business_modules")
      .select("module_code, is_enabled")
      .eq("business_id", active.businessId),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("business_members")
      .select("roles(name, is_owner)")
      .eq("business_id", active.businessId)
      .eq("user_id", user.id)
      .single(),
  ]);

  for (const r of [business, permissions, modules, member]) {
    if (r.error) throw new Error(`Could not load business context: ${r.error.message}`);
  }

  const permissionSet = new Set<PermissionCode>(
    ((permissions.data ?? []) as unknown[]).filter(
      (c): c is PermissionCode => typeof c === "string" && isPermissionCode(c),
    ),
  );
  const enabled = new Set<OptionalModuleCode>(
    ((modules.data ?? []) as { module_code: string; is_enabled: boolean }[])
      .filter(
        (m) => m.is_enabled && (OPTIONAL_MODULES as readonly string[]).includes(m.module_code),
      )
      .map((m) => m.module_code as OptionalModuleCode),
  );
  const role = (member.data as unknown as { roles: { name: string; is_owner: boolean } | null })
    .roles;

  return {
    user,
    fullName: (profile.data as { full_name: string } | null)?.full_name ?? "",
    business: {
      ...active,
      currencyCode: (business.data as { currency_code: string }).currency_code,
      timezone: (business.data as { timezone: string }).timezone,
    },
    memberships,
    roleName: role?.name ?? "",
    isOwner: role?.is_owner ?? false,
    permissions: permissionSet,
    enabledModules: enabled,
    can: (p) => permissionSet.has(p),
    moduleActive: (code) => isModuleActive(code, enabled),
  };
});

export function activeBusinessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
