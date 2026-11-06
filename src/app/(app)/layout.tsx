import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PILOT_ENABLED_MODULES } from "@/modules/registry";

/**
 * Shell for every signed-in screen.
 *
 * Stage 2: business name and enabled modules are fixed placeholders.
 * Stage 3–4: they come from the database for the user's active business,
 * and disabled-module routes are blocked on the server.
 */
const PLACEHOLDER_BUSINESS_NAME = "Your business";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar
        businessName={PLACEHOLDER_BUSINESS_NAME}
        enabledModules={[...PILOT_ENABLED_MODULES]}
      />
      <SidebarInset className="min-w-0">
        <TopBar businessName={PLACEHOLDER_BUSINESS_NAME} />
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
