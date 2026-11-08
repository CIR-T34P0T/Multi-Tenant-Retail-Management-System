import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus, Ruler } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  ProductFilterForm,
  ProductList,
} from "@/modules/catalog/products/components/product-list";
import { getCatalogChoices, listProducts } from "@/modules/catalog/products/queries";
import { parseProductListFilter } from "@/modules/catalog/products/schemas";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const [ctx, params] = await Promise.all([getAppContext(), searchParams]);
  const canManage = ctx.can("catalog.product.manage");
  const canView = canManage || ctx.can("catalog.product.view");
  const showPrices = ctx.can("pricing.price.view") || ctx.can("pricing.price.update");

  const header = (
    <PageHeader
      title="Products"
      description="Everything you stock and sell, with variants, units and prices."
      actions={
        canView ? (
          <>
            <Button asChild variant="outline" className="h-11 md:h-9">
              <Link href="/products/units">
                <Ruler /> Units
              </Link>
            </Button>
            {canManage ? (
              <Button asChild className="h-11 md:h-9">
                <Link href="/products/new">
                  <Plus /> New product
                </Link>
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
  if (!canView) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ReadOnlyNote>You do not have permission to see products.</ReadOnlyNote>
      </div>
    );
  }

  const filter = parseProductListFilter(params);
  const businessId = ctx.business.businessId;
  const [{ sections }, { rows, total }] = await Promise.all([
    getCatalogChoices(businessId),
    listProducts(businessId, filter, { withPrices: showPrices }),
  ]);
  const filtered =
    filter.q !== "" || filter.sectionId || filter.categoryId || filter.status !== "active";

  return (
    <div className="flex flex-col gap-6">
      {header}
      {!canManage ? <ReadOnlyNote>You can view products but not change them.</ReadOnlyNote> : null}
      <ProductFilterForm filter={filter} sections={sections} />
      {rows.length > 0 ? (
        <>
          <ProductList rows={rows} currency={ctx.business.currencyCode} showPrices={showPrices} />
          <Pagination filter={filter} total={total} />
        </>
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "No matching products" : "No products yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another search or filter."
                : canManage
                  ? "Add your first product with the New product button."
                  : "The owner has not added any products yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
