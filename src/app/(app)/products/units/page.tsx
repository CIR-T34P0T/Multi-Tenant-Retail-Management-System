import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UnitsManager } from "@/modules/catalog/products/components/units-manager";
import { getCatalogChoices } from "@/modules/catalog/products/queries";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Units" };

export default async function UnitsPage() {
  const ctx = await getAppContext();
  const canManage = ctx.can("catalog.product.manage");
  const canView = canManage || ctx.can("catalog.product.view");
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/products"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> All products
      </Link>
      <PageHeader
        title="Units"
        description="How you count, buy and sell things: pieces, packs, cartons, kilograms…"
      />
      {canView ? (
        <>
          {!canManage ? <ReadOnlyNote>You can view units but not change them.</ReadOnlyNote> : null}
          <UnitsManager
            units={(await getCatalogChoices(ctx.business.businessId)).units}
            canManage={canManage}
          />
        </>
      ) : (
        <ReadOnlyNote>You do not have permission to see units.</ReadOnlyNote>
      )}
    </div>
  );
}
