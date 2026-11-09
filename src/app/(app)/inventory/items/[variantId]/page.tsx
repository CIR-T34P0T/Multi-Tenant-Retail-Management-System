import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatQuantity, toDecimal } from "@/lib/decimal";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";
import { MovementForm } from "@/modules/inventory/components/movement-form";
import { MovementList } from "@/modules/inventory/components/movement-list";
import { Qty, StockStatusBadge } from "@/modules/inventory/components/stock-display";
import { PageNav } from "@/modules/inventory/components/stock-list";
import { getStockItem, listMovements } from "@/modules/inventory/queries";
import {
  MANUAL_TYPES,
  MOVEMENT_PAGE_SIZE,
  WRITE_OFF_TYPES,
  parseMovementFilter,
  type ManualType,
} from "@/modules/inventory/schemas";
import { z } from "zod";

export const metadata: Metadata = { title: "Stock" };

export default async function StockItemPage({
  params,
  searchParams,
}: PageProps<"/inventory/items/[variantId]">) {
  const [ctx, { variantId }, query] = await Promise.all([getAppContext(), params, searchParams]);
  if (!z.uuid().safeParse(variantId).success || !ctx.can("inventory.stock.view")) notFound();
  const businessId = ctx.business.businessId;
  const { page } = parseMovementFilter(query);
  const [item, history] = await Promise.all([
    getStockItem(businessId, variantId),
    listMovements(businessId, { variantId, page }),
  ]);
  if (!item) notFound();

  const canAdjust = ctx.can("inventory.stock.adjust");
  const canWriteOff = ctx.can("inventory.writeoff.record");
  const types: ManualType[] = MANUAL_TYPES.filter((t) => {
    if (t === "opening") return canAdjust && !item.hasMovements;
    if (t === "stock_in") return canAdjust && item.hasMovements;
    if (t === "stock_out") return canAdjust;
    return canWriteOff && (WRITE_OFF_TYPES as readonly string[]).includes(t);
  });
  const name = `${item.productName}${item.label ? ` · ${item.label}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/inventory"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Inventory
      </Link>
      <PageHeader
        title={name}
        description={`${item.sectionName} · ${item.sku}${item.barcode ? ` · ${item.barcode}` : ""}`}
        actions={
          <Button asChild variant="outline" className="h-11 md:h-9">
            <Link href={`/products/${item.productId}`}>
              <Package /> Product
            </Link>
          </Button>
        }
      />
      {!item.isActive ? (
        <ReadOnlyNote>
          This item is archived. Restore it on its product page to change its stock.
        </ReadOnlyNote>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>In stock</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="flex flex-wrap items-center gap-3">
              <Qty
                value={item.onHand}
                unit={item.baseUnitCode}
                className="text-3xl font-semibold"
              />
              <StockStatusBadge status={item.status} />
            </p>
            <p className="text-muted-foreground text-sm">
              {!toDecimal(item.minLevel).isZero()
                ? `Low-stock alert at ${formatQuantity(item.minLevel, item.baseUnitCode)}.`
                : "No low-stock alert set."}{" "}
              <Link href={`/products/${item.productId}`} className="underline underline-offset-4">
                Change on the product page
              </Link>
            </p>
            {item.units.length > 1 ? (
              <ul className="text-muted-foreground text-sm" aria-label="Units">
                {item.units
                  .filter((u) => !u.isBase)
                  .map((u) => (
                    <li key={u.unitId}>
                      1 {u.name.toLowerCase()} = {formatQuantity(u.factor, item.baseUnitCode)}
                    </li>
                  ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change stock</CardTitle>
          </CardHeader>
          <CardContent>
            {item.isActive && types.length > 0 ? (
              <MovementForm
                variantId={item.variantId}
                units={item.units}
                baseUnitCode={item.baseUnitCode}
                onHand={item.onHand}
                types={types}
              />
            ) : (
              <ReadOnlyNote>
                {item.isActive
                  ? "You can view this item's stock but not change it."
                  : "Archived items cannot have stock changes."}
              </ReadOnlyNote>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-semibold">
          History
        </h2>
        {history.rows.length > 0 ? (
          <>
            <MovementList rows={history.rows} timeZone={ctx.business.timezone} />
            <PageNav
              page={page}
              total={history.total}
              pageSize={MOVEMENT_PAGE_SIZE}
              noun="changes"
              href={(p) => `/inventory/items/${variantId}${p > 1 ? `?page=${p}` : ""}`}
            />
          </>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No stock recorded yet. Start with the opening stock.
          </p>
        )}
      </section>
    </div>
  );
}
