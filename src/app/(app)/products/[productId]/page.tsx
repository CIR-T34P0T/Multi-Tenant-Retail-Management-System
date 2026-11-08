import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { setProductStatus } from "@/modules/catalog/products/actions";
import { ImageCard } from "@/modules/catalog/products/components/image-card";
import { ProductDetailsForm } from "@/modules/catalog/products/components/product-details-form";
import { UnitsCard } from "@/modules/catalog/products/components/units-card";
import { VariantsCard } from "@/modules/catalog/products/components/variants-card";
import { getCatalogChoices, getProductDetail } from "@/modules/catalog/products/queries";
import { idSchema } from "@/modules/catalog/products/schemas";
import { StatusButton } from "@/modules/catalog/sections/components/status-button";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/products/[productId]">) {
  const [ctx, { productId }] = await Promise.all([getAppContext(), params]);
  // Unknown, malformed or another business's ID: the same "not found" for all.
  if (!idSchema.safeParse(productId).success) notFound();
  const canManage = ctx.can("catalog.product.manage");
  if (!canManage && !ctx.can("catalog.product.view")) notFound();

  const businessId = ctx.business.businessId;
  const [product, choices] = await Promise.all([
    getProductDetail(businessId, productId),
    getCatalogChoices(businessId),
  ]);
  if (!product) notFound();

  const active = product.status === "active";
  const canPrice = ctx.can("pricing.price.update");
  const canSeeCost = ctx.can("inventory.cost.view");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/products"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> All products
      </Link>
      <PageHeader
        title={product.name}
        description={`${product.sectionName}${product.categoryName ? ` › ${product.categoryName}` : ""}${product.brand ? ` · ${product.brand}` : ""}`}
        actions={
          <>
            {!active ? <Badge variant="outline">Archived</Badge> : null}
            {canManage ? (
              <StatusButton
                name={product.name}
                status={product.status}
                explanation="It and all its variants will no longer be offered for sale or stock entry."
                onChange={setProductStatus.bind(null, product.id)}
              />
            ) : null}
          </>
        }
      />
      {!active ? (
        <ReadOnlyNote>This product is archived. Restore it to make changes.</ReadOnlyNote>
      ) : null}
      {!canManage ? (
        <ReadOnlyNote>You can view this product but not change it.</ReadOnlyNote>
      ) : null}

      <VariantsCard
        productId={product.id}
        productActive={active}
        optionNames={product.optionNames}
        variants={product.variants}
        units={product.units}
        prices={product.prices}
        costs={product.costs}
        currency={ctx.business.currencyCode}
        timeZone={ctx.business.timezone}
        canManage={canManage}
        canPrice={canPrice}
        canSeePrices={ctx.can("pricing.price.view") || canPrice}
        canSeeCost={canSeeCost}
        canCost={canPrice && canSeeCost}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <UnitsCard
          productId={product.id}
          productActive={active}
          units={product.units}
          allUnits={choices.units}
          canManage={canManage}
          canPrice={canPrice}
          currency={ctx.business.currencyCode}
        />
        <ImageCard
          productId={product.id}
          productName={product.name}
          imageUrl={product.imageUrl}
          hasImage={product.hasImage}
          canManage={canManage && active}
        />
      </div>

      {canManage && active ? (
        <ProductDetailsForm product={product} sections={choices.sections} />
      ) : null}
    </div>
  );
}
