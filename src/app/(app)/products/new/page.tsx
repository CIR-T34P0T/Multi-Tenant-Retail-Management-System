import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { NewProductForm } from "@/modules/catalog/products/components/new-product-form";
import { getCatalogChoices } from "@/modules/catalog/products/queries";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const ctx = await getAppContext();
  const back = (
    <Link
      href="/products"
      className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
    >
      <ArrowLeft className="size-4" /> All products
    </Link>
  );
  if (!ctx.can("catalog.product.manage")) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <PageHeader title="New product" />
        <ReadOnlyNote>You do not have permission to add products.</ReadOnlyNote>
      </div>
    );
  }

  const { sections, units } = await getCatalogChoices(ctx.business.businessId);
  return (
    <div className="flex flex-col gap-6">
      {back}
      <PageHeader title="New product" description="Add something you stock or sell." />
      {sections.length === 0 ? (
        <div className="grid gap-3">
          <ReadOnlyNote>Every product belongs to a section. Create a section first.</ReadOnlyNote>
          <Button asChild className="h-11 w-fit md:h-9">
            <Link href="/sections">Go to sections</Link>
          </Button>
        </div>
      ) : (
        <NewProductForm
          sections={sections}
          units={units}
          canPrice={ctx.can("pricing.price.update")}
          canCost={ctx.can("pricing.price.update") && ctx.can("inventory.cost.view")}
          currency={ctx.business.currencyCode}
        />
      )}
    </div>
  );
}
