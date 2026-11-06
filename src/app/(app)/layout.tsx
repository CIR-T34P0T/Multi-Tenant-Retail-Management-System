import { Suspense } from "react";
import { AppSidebarFallback, AppSidebarLoader } from "@/components/layout/app-sidebar-loader";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Shell for every signed-in screen. The frame renders instantly; the parts that
 * depend on who is signed in (sidebar, business name, page content) stream in.
 * Access is enforced by the proxy (signed in?), getAppContext() (member of a
 * business?) and the database (allowed to see this data?).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebarFallback />}>
        <AppSidebarLoader />
      </Suspense>
      <SidebarInset className="min-w-0">
        <TopBar />
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
