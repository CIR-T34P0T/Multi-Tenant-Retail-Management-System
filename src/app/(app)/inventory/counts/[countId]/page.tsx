import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { toDecimal } from "@/lib/decimal";
import { when } from "@/modules/catalog/products/components/format";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";
import { CountActions, CountSheet } from "@/modules/inventory/components/count-forms";
import { MovementList } from "@/modules/inventory/components/movement-list";
import { getCount, listMovements } from "@/modules/inventory/queries";

export const metadata: Metadata = { title: "Stock count" };

export default async function CountPage({ params }: PageProps<"/inventory/counts/[countId]">) {
  const [ctx, { countId }] = await Promise.all([getAppContext(), params]);
  const canPost = ctx.can("inventory.count.post");
  if (!z.uuid().safeParse(countId).success || !(canPost || ctx.can("inventory.count.perform")))
    notFound();
  const result = await getCount(ctx.business.businessId, countId);
  if (!result) notFound();
  const { count, lines } = result;
  const open = count.status === "open";
  const differences = lines.filter(
    (l) =>
      l.counted !== null &&
      l.systemQuantity !== null &&
      !toDecimal(l.counted).eq(toDecimal(l.systemQuantity)),
  ).length;
  const adjustments =
    count.status === "posted" && ctx.can("inventory.stock.view")
      ? await listMovements(ctx.business.businessId, { countId, pageSize: 200 })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/inventory/counts"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Stock counts
      </Link>
      <PageHeader
        title={`Count ${count.number} · ${count.scope}`}
        description={`Started ${when(count.createdAt, ctx.business.timezone)}${count.note ? ` · ${count.note}` : ""} · ${count.counted} of ${count.lines} counted`}
        actions={
          open ? (
            canPost ? (
              <CountActions
                countId={count.id}
                counted={count.counted}
                total={count.lines}
                differences={differences}
              />
            ) : (
              <Badge>In progress</Badge>
            )
          ) : (
            <Badge variant="outline">{count.status === "posted" ? "Posted" : "Cancelled"}</Badge>
          )
        }
      />
      {open ? (
        <ReadOnlyNote>
          Type what you find on the shelf; each line saves by itself. Sales and other changes can
          carry on while you count. The difference is worked out from the stock at the moment each
          line was counted.
        </ReadOnlyNote>
      ) : count.status === "cancelled" ? (
        <ReadOnlyNote>This count was cancelled. No stock was changed.</ReadOnlyNote>
      ) : null}
      <CountSheet lines={lines} open={open} />
      {adjustments && adjustments.rows.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="adjustments-title">
          <h2 id="adjustments-title" className="text-lg font-semibold">
            Corrections made
          </h2>
          <MovementList
            rows={adjustments.rows}
            timeZone={ctx.business.timezone}
            showItem
            label="Corrections made"
          />
        </section>
      ) : null}
    </div>
  );
}
