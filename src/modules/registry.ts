import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  CreditCard,
  LayoutDashboard,
  Layers,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

/**
 * Module registry — the single list of modules, their dependencies and menus.
 *
 * Design rules (docs/07-module-dependency-map.md §6):
 *  - Core modules are always on; inventory works with every optional module off.
 *  - An optional module can be enabled only if the modules it requires are on.
 *  - A module cannot be disabled while another enabled module requires it.
 *  - Disabling hides and blocks a module; it never deletes its data.
 *
 * This file only describes modules. It must not import module code.
 */

export const CORE_MODULES = ["core", "catalog", "pricing", "inventory", "dashboard"] as const;
export const OPTIONAL_MODULES = [
  "sales",
  "purchases",
  "suppliers",
  "customers",
  "credit",
  "expenses",
  "accounting",
  "analytics",
] as const;

export type CoreModuleCode = (typeof CORE_MODULES)[number];
export type OptionalModuleCode = (typeof OPTIONAL_MODULES)[number];
export type ModuleCode = CoreModuleCode | OptionalModuleCode;

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type ModuleManifest = {
  code: ModuleCode;
  name: string;
  description: string;
  kind: "core" | "optional";
  /** Modules that must be enabled for this one to work. */
  requires: ModuleCode[];
  /** Stage in docs/10 §5 where the module is built. */
  stage: number;
  nav: NavItem[];
  /** Menu group label. */
  group: "Overview" | "Catalogue & stock" | "Trading" | "Finance" | "Administration";
};

export const MODULES: readonly ModuleManifest[] = [
  {
    code: "dashboard",
    name: "Dashboard",
    description: "Business-wide overview with section filter.",
    kind: "core",
    requires: ["inventory"],
    stage: 8,
    group: "Overview",
    nav: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    code: "catalog",
    name: "Sections & catalogue",
    description: "Sections, categories, products, variants and units.",
    kind: "core",
    requires: ["core"],
    stage: 5,
    group: "Catalogue & stock",
    nav: [
      { title: "Sections", href: "/sections", icon: Layers },
      { title: "Products", href: "/products", icon: Package },
    ],
  },
  {
    code: "pricing",
    name: "Pricing",
    description: "Owner-set prices with full history.",
    kind: "core",
    requires: ["catalog"],
    stage: 6,
    group: "Catalogue & stock",
    nav: [],
  },
  {
    code: "inventory",
    name: "Inventory",
    description: "Stock levels, manual changes, counts, write-offs and the movement ledger.",
    kind: "core",
    requires: ["catalog"],
    stage: 7,
    group: "Catalogue & stock",
    nav: [{ title: "Inventory", href: "/inventory", icon: Warehouse }],
  },
  {
    code: "sales",
    name: "Sales",
    description: "Point of sale, payments, receipts and sales history.",
    kind: "optional",
    requires: ["pricing", "inventory"],
    stage: 9,
    group: "Trading",
    nav: [{ title: "Sales", href: "/sales", icon: ShoppingCart }],
  },
  {
    code: "purchases",
    name: "Purchases",
    description: "Receive goods; stock increases automatically when received.",
    kind: "optional",
    requires: ["inventory"],
    stage: 10,
    group: "Trading",
    nav: [{ title: "Purchases", href: "/purchases", icon: Boxes }],
  },
  {
    code: "suppliers",
    name: "Suppliers",
    description: "Supplier records and purchase history.",
    kind: "optional",
    requires: ["core"],
    stage: 10,
    group: "Trading",
    nav: [{ title: "Suppliers", href: "/suppliers", icon: Truck }],
  },
  {
    code: "customers",
    name: "Customers",
    description: "Customer records and purchase history.",
    kind: "optional",
    requires: ["core"],
    stage: 11,
    group: "Trading",
    nav: [{ title: "Customers", href: "/customers", icon: Users }],
  },
  {
    code: "credit",
    name: "Credit",
    description: "Sales on credit, balances and repayments.",
    kind: "optional",
    requires: ["sales", "customers"],
    stage: 11,
    group: "Finance",
    nav: [{ title: "Credit", href: "/credit", icon: CreditCard }],
  },
  {
    code: "expenses",
    name: "Expenses",
    description: "Operating expenses with categories and receipts.",
    kind: "optional",
    requires: ["core"],
    stage: 12,
    group: "Finance",
    nav: [{ title: "Expenses", href: "/expenses", icon: Wallet }],
  },
  {
    code: "accounting",
    name: "Accounting",
    description: "Ledgers and financial statements built from recorded transactions.",
    kind: "optional",
    requires: ["core"],
    stage: 12,
    group: "Finance",
    nav: [{ title: "Accounting", href: "/accounting", icon: BookOpen }],
  },
  {
    code: "analytics",
    name: "Advanced analytics",
    description: "Trends and deeper analysis beyond the core reports.",
    kind: "optional",
    requires: ["dashboard"],
    stage: 13,
    group: "Finance",
    nav: [],
  },
  {
    code: "core",
    name: "Business & users",
    description: "Business settings, members, roles and permissions, reports, audit.",
    kind: "core",
    requires: [],
    stage: 4,
    group: "Administration",
    nav: [
      { title: "Reports", href: "/reports", icon: BarChart3 },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/** Modules switched on for the pilot shop (docs/12 §4–§5). */
export const PILOT_ENABLED_MODULES: ReadonlySet<OptionalModuleCode> = new Set([
  "sales",
  "purchases",
  "suppliers",
  "customers",
  "credit",
]);

export function getModule(code: ModuleCode): ModuleManifest {
  const found = MODULES.find((m) => m.code === code);
  if (!found) throw new Error(`Unknown module: ${code}`);
  return found;
}

export function isCoreModule(code: ModuleCode): code is CoreModuleCode {
  return (CORE_MODULES as readonly string[]).includes(code);
}

/** Core modules are always active; optional ones only when enabled. */
export function isModuleActive(
  code: ModuleCode,
  enabled: ReadonlySet<OptionalModuleCode>,
): boolean {
  return isCoreModule(code) || enabled.has(code as OptionalModuleCode);
}

export type NavGroup = { label: ModuleManifest["group"]; items: NavItem[] };

const GROUP_ORDER: ModuleManifest["group"][] = [
  "Overview",
  "Catalogue & stock",
  "Trading",
  "Finance",
  "Administration",
];

/** Menu for a business: only active modules appear. */
export function getNavigation(enabled: ReadonlySet<OptionalModuleCode>): NavGroup[] {
  return GROUP_ORDER.map((label) => ({
    label,
    items: MODULES.filter((m) => m.group === label && isModuleActive(m.code, enabled)).flatMap(
      (m) => m.nav,
    ),
  })).filter((g) => g.items.length > 0);
}

export type ModuleChangeResult = { ok: true } | { ok: false; reason: string };

/** Checks whether an optional module may be switched on or off. */
export function checkModuleChange(
  code: ModuleCode,
  enable: boolean,
  enabled: ReadonlySet<OptionalModuleCode>,
): ModuleChangeResult {
  const manifest = getModule(code);
  if (manifest.kind === "core") {
    return { ok: false, reason: `${manifest.name} is a core module and is always on.` };
  }
  if (enable) {
    const missing = manifest.requires.filter((dep) => !isModuleActive(dep, enabled));
    if (missing.length > 0) {
      const names = missing.map((d) => getModule(d).name).join(", ");
      return { ok: false, reason: `${manifest.name} needs ${names} to be enabled first.` };
    }
    return { ok: true };
  }
  const dependents = MODULES.filter(
    (m) => m.requires.includes(code) && isModuleActive(m.code, enabled) && m.kind === "optional",
  );
  if (dependents.length > 0) {
    const names = dependents.map((d) => d.name).join(", ");
    return { ok: false, reason: `Disable ${names} first; it needs ${manifest.name}.` };
  }
  return { ok: true };
}

/**
 * Adds every module the selection depends on, and orders the result so each
 * module comes after the ones it requires (safe order for switching them on).
 * Example: ["credit"] → ["sales", "customers", "credit"].
 */
export function withRequirementsInOrder(selected: Iterable<ModuleCode>): OptionalModuleCode[] {
  const ordered: OptionalModuleCode[] = [];
  const seen = new Set<ModuleCode>();
  const visit = (code: ModuleCode) => {
    if (seen.has(code)) return;
    seen.add(code);
    getModule(code).requires.forEach(visit);
    if (!isCoreModule(code)) ordered.push(code as OptionalModuleCode);
  };
  for (const code of selected) visit(code);
  return ordered;
}

export function isOptionalModuleCode(value: string): value is OptionalModuleCode {
  return (OPTIONAL_MODULES as readonly string[]).includes(value);
}
