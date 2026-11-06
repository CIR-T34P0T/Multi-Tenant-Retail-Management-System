import { getAppContext } from "@/modules/core/business/context";
import { AppSidebar } from "./app-sidebar";

/** Loads the signed-in user's business data for the sidebar (runs on the server). */
export async function AppSidebarLoader() {
  const ctx = await getAppContext();
  return (
    <AppSidebar
      business={{ id: ctx.business.businessId, name: ctx.business.name }}
      memberships={ctx.memberships.map((m) => ({ businessId: m.businessId, name: m.name }))}
      enabledModules={[...ctx.enabledModules]}
      user={{ name: ctx.fullName, email: ctx.user.email, role: ctx.roleName }}
    />
  );
}

/** Placeholder while the sidebar loads. */
export function AppSidebarFallback() {
  return (
    <div className="bg-sidebar hidden w-(--sidebar-width) shrink-0 border-r md:block" aria-hidden />
  );
}
