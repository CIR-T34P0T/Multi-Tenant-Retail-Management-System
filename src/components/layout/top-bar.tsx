import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";

/** Sticky header with menu button (opens the panel on phones) and theme switch. */
export function TopBar({ businessName }: { businessName: string }) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="size-11 md:size-8" aria-label="Open or close menu" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <span className="truncate font-medium">{businessName}</span>
      <div className="ml-auto flex items-center gap-1">
        {/* Stage 4: business switcher and user menu go here. */}
        <ThemeToggle />
      </div>
    </header>
  );
}
