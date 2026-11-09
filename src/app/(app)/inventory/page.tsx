import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, History, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCatalogChoices } from "@/modules/catalog/products/queries";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";
import { CheckRecordsButton } from "@/modules/inventory/components/count-forms";
import {
  PageNav,
  StockFilterForm,
  StockList,
  StockSummary,
} from "@/modules/inventory/components/stock-list";
import { getStockSummary, listStock } from "@/modules/inventory/queries";
import { STOCK_PAGE_SIZE, parseStockFilter, stockFilterHref } from "@/modules/inventory/schemas";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const [ctx, params] = await Promise.all([getAppContext(), searchParams]);
  const canView = ctx.can("inventory.stock.view");
  const canCount = ctx.can("inventory.count.perform") || ctx.can("inventory.count.post");

  const header = (
    <PageHeader
      title="Inventory"
      description="What you have in stock, and every change to it."
      actions={
        <>
          {canCount ? (
            <Button asChild variant="outline" className="h-11 md:h-9">
              <Link href="/inventory/counts">
                <ClipboardList /> Stock counts
              </Link>
            </Button>
          ) : null}
          {canView ? (
            <Button asChild variant="outline" className="h-11 md:h-9">
              <Link href="/inventory/movements">
                <History /> History
              </Link>
            </Button>
          ) : null}
        </>
      }
    />
  );
  if (!canView) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ReadOnlyNote>You do not have permission to see stock levels.</ReadOnlyNote>
      </div>
    );
  }

  const filter = parseStockFilter(params);
  const businessId = ctx.business.businessId;
  const [summary, { sections }, { rows, total }] = await Promise.all([
    getStockSummary(businessId),
    getCatalogChoices(businessId),
    listStock(businessId, filter),
  ]);
  const filtered =
    filter.q !== "" ||
    filter.sectionId ||
    filter.categoryId ||
    filter.status !== "all" ||
    filter.archived;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <StockSummary summary={summary} filter={filter} />
      <StockFilterForm filter={filter} sections={sections} />
      {filter.archived ? (
        <ReadOnlyNote>
          Showing archived items only.{" "}
          <Link href="/inventory" className="underline underline-offset-4">
            Show active items
          </Link>
        </ReadOnlyNote>
      ) : null}
      {rows.length > 0 ? (
        <>
          <StockList rows={rows} />
          <PageNav
            page={filter.page}
            total={total}
            pageSize={STOCK_PAGE_SIZE}
            noun="items"
            href={(p) => stockFilterHref(filter, p)}
          />
        </>
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Warehouse />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "Nothing matches" : "No items yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered ? (
                "Try another search or filter."
              ) : (
                <>
                  Add products first; each one appears here with its stock.{" "}
                  <Link href="/products" className="underline underline-offset-4">
                    Go to products
                  </Link>
                </>
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <CheckRecordsButton />
        {!filter.archived ? (
          <Link
            href={stockFilterHref({ ...filter, archived: true, status: "all", page: 1 })}
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            Show archived items
          </Link>
        ) : null}
      </div>
    </div>
  );
}
