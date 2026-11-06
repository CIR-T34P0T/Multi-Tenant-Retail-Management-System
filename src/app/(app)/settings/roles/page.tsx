import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";
import {
  NewRoleForm,
  RoleEditor,
  type PermissionInfo,
  type RoleInfo,
} from "@/modules/core/settings/components/role-editor";
import { MODULES } from "@/modules/registry";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  const ctx = await getAppContext();
  const canManage = ctx.can("core.role.manage");
  const supabase = await createClient();
  const [roles, grants, permissions] = await Promise.all([
    supabase
      .from("roles")
      .select("id, name, description, is_owner")
      .eq("business_id", ctx.business.businessId),
    supabase
      .from("role_permissions")
      .select("role_id, permission_code")
      .eq("business_id", ctx.business.businessId),
    supabase.from("permissions").select("code, module_code, description, is_sensitive"),
  ]);
  for (const r of [roles, grants, permissions]) if (r.error) throw new Error(r.error.message);

  const moduleOrder = new Map(MODULES.map((m, i) => [m.code as string, i]));
  // Only show permissions for features that are switched on (others can be granted later).
  const catalogue: PermissionInfo[] = (
    permissions.data as {
      code: string;
      module_code: string;
      description: string;
      is_sensitive: boolean;
    }[]
  )
    .filter((p) => ctx.moduleActive(p.module_code as never))
    .sort((a, b) => (moduleOrder.get(a.module_code) ?? 99) - (moduleOrder.get(b.module_code) ?? 99))
    .map((p) => ({
      code: p.code,
      description: p.description,
      module: p.module_code,
      moduleName: MODULES.find((m) => m.code === p.module_code)?.name ?? p.module_code,
      sensitive: p.is_sensitive,
    }));
  const visible = new Set(catalogue.map((p) => p.code));

  const roleList: RoleInfo[] = (roles.data as Omit<RoleInfo, "permissions">[])
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.name.localeCompare(b.name))
    .map((r) => ({
      ...r,
      permissions: (grants.data as { role_id: string; permission_code: string }[])
        .filter((g) => g.role_id === r.id && visible.has(g.permission_code))
        .map((g) => g.permission_code),
    }));

  return (
    <div className="grid gap-4">
      {canManage ? <NewRoleForm /> : <ReadOnlyNote>Only the owner can change roles.</ReadOnlyNote>}
      <p className="text-muted-foreground text-sm">
        Permissions for features that are switched off are kept but not shown.
      </p>
      {roleList.map((r) => (
        <RoleEditor key={r.id} role={r} catalogue={catalogue} canManage={canManage} />
      ))}
    </div>
  );
}
