import { Suspense } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getAppContext } from "@/modules/core/business/context";
import { ThemeToggle } from "./theme-toggle";

async function BusinessName() {
  const ctx = await getAppContext();
  return <span className="truncate font-medium">{ctx.business.name}</span>;
}

/** Sticky header with menu button (opens the panel on phones) and theme switch. */
export function TopBar() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="size-11 md:size-8" aria-label="Open or close menu" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <Suspense fallback={<Skeleton className="h-5 w-32" />}>
        <BusinessName />
      </Suspense>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
