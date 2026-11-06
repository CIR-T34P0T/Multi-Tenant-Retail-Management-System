"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/lib/app-config";
import { getNavigation, type OptionalModuleCode } from "@/modules/registry";

type AppSidebarProps = {
  businessName: string;
  /** Optional modules switched on for this business. */
  enabledModules: OptionalModuleCode[];
};

/**
 * Main navigation. Desktop: collapsible sidebar. Phone: slide-out panel.
 * Menu items come from the module registry, so disabled modules never appear.
 * (Hiding is convenience only — servers and the database also block access.)
 */
export function AppSidebar({ businessName, enabledModules }: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = getNavigation(new Set(enabledModules));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={businessName}>
              <Link href="/dashboard">
                <span className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Store className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{businessName}</span>
                  <span className="text-muted-foreground truncate text-xs">{APP_NAME}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="h-11 md:h-8"
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => isMobile && setOpenMobile(false)}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <p className="text-muted-foreground px-2 text-xs group-data-[collapsible=icon]:hidden">
          Development build · Stage 2
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
