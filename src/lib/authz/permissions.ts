/**
 * Permission catalogue — mirrors `public.permissions`
 * (supabase/migrations/20261106100200_reference_data.sql).
 * A unit test fails if the two lists drift apart.
 *
 * The database enforces every permission on its own; this list is for
 * type-safe server checks and for showing or hiding parts of the UI.
 */
export const PERMISSIONS = {
  "core.business.update": { module: "core", sensitive: true },
  "core.settings.manage": { module: "core", sensitive: true },
  "core.module.manage": { module: "core", sensitive: true },
  "core.member.view": { module: "core", sensitive: false },
  "core.member.manage": { module: "core", sensitive: true },
  "core.role.manage": { module: "core", sensitive: true },
  "core.audit.view": { module: "core", sensitive: false },
  "core.data.export": { module: "core", sensitive: true },
  "catalog.product.view": { module: "catalog", sensitive: false },
  "catalog.product.manage": { module: "catalog", sensitive: false },
  "catalog.section.manage": { module: "catalog", sensitive: false },
  "pricing.price.view": { module: "pricing", sensitive: false },
  "pricing.price.update": { module: "pricing", sensitive: true },
  "inventory.stock.view": { module: "inventory", sensitive: false },
  "inventory.cost.view": { module: "inventory", sensitive: true },
  "inventory.stock.adjust": { module: "inventory", sensitive: true },
  "inventory.adjustment.approve": { module: "inventory", sensitive: true },
  "inventory.writeoff.record": { module: "inventory", sensitive: true },
  "inventory.count.perform": { module: "inventory", sensitive: false },
  "inventory.count.post": { module: "inventory", sensitive: true },
  "dashboard.overview.view": { module: "dashboard", sensitive: false },
  "dashboard.report.view": { module: "dashboard", sensitive: false },
  "dashboard.report.export": { module: "dashboard", sensitive: false },
  "sales.pos.use": { module: "sales", sensitive: false },
  "sales.sale.view_own": { module: "sales", sensitive: false },
  "sales.sale.view_all": { module: "sales", sensitive: false },
  "sales.discount.apply": { module: "sales", sensitive: true },
  "sales.price.override": { module: "sales", sensitive: true },
  "sales.sale.cancel": { module: "sales", sensitive: true },
  "sales.return.process": { module: "sales", sensitive: true },
  "sales.cash.manage": { module: "sales", sensitive: true },
  "sales.report.view": { module: "sales", sensitive: false },
  "purchases.purchase.manage": { module: "purchases", sensitive: false },
  "purchases.purchase.receive": { module: "purchases", sensitive: false },
  "suppliers.supplier.view": { module: "suppliers", sensitive: false },
  "suppliers.supplier.manage": { module: "suppliers", sensitive: false },
  "customers.customer.view": { module: "customers", sensitive: false },
  "customers.customer.manage": { module: "customers", sensitive: false },
  "customers.customer.erase": { module: "customers", sensitive: true },
  "credit.sale.on_credit": { module: "credit", sensitive: true },
  "credit.payment.record": { module: "credit", sensitive: false },
  "credit.balance.view": { module: "credit", sensitive: false },
  "expenses.expense.record": { module: "expenses", sensitive: false },
  "expenses.expense.approve": { module: "expenses", sensitive: true },
  "expenses.report.view": { module: "expenses", sensitive: false },
  "accounting.ledger.view": { module: "accounting", sensitive: false },
  "accounting.ledger.manage": { module: "accounting", sensitive: true },
  "analytics.report.view": { module: "analytics", sensitive: false },
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}
