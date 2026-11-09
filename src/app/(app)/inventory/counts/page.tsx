import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalogChoices } from "@/modules/catalog/products/queries";
import { when } from "@/modules/catalog/products/components/format";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";
import { StartCountForm } from "@/modules/inventory/components/count-forms";
import { listCounts, type CountStatus } from "@/modules/inventory/queries";

export const metadata: Metadata = { title: "Stock counts" };

const STATUS: Record<CountStatus, string> = {
  open: "In progress",
  posted: "Posted",
  cancelled: "Cancelled",
};

export default async function CountsPage() {
  const ctx = await getAppContext();
  const canPost = ctx.can("inventory.count.post");
  const canCount = canPost || ctx.can("inventory.count.perform");
  const back = (
    <Link
      href="/inventory"
      className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
    >
      <ArrowLeft className="size-4" /> Inventory
    </Link>
  );
  if (!canCount) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <PageHeader title="Stock counts" />
        <ReadOnlyNote>You do not have permission to count stock.</ReadOnlyNote>
      </div>
    );
  }
  const [counts, { sections }] = await Promise.all([
    listCounts(ctx.business.businessId),
    getCatalogChoices(ctx.business.businessId),
  ]);
  const open = counts.find((c) => c.status === "open");

  return (
    <div className="flex flex-col gap-6">
      {back}
      <PageHeader
        title="Stock counts"
        description="Count what is on the shelves and correct the system to match."
      />
      {canPost && !open ? (
        <Card>
          <CardHeader>
            <CardTitle>Start a count</CardTitle>
          </CardHeader>
          <CardContent>
            <StartCountForm sections={sections} />
          </CardContent>
        </Card>
      ) : null}
      {!canPost && !open ? (
        <ReadOnlyNote>No count is in progress. The owner or a manager starts counts.</ReadOnlyNote>
      ) : null}
      {counts.length > 0 ? (
        <ul className="divide-y rounded-lg border" aria-label="Stock counts">
          {counts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/inventory/counts/${c.id}`}
                className="hover:bg-muted/50 flex items-center gap-3 p-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Count {c.number} · {c.scope}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {when(c.createdAt, ctx.business.timezone)} · {c.counted} of {c.lines} counted
                    {c.note ? ` · ${c.note}` : ""}
                  </p>
                </div>
                <Badge variant={c.status === "open" ? "default" : "outline"}>
                  {STATUS[c.status]}
                </Badge>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No stock counts yet.
        </p>
      )}
    </div>
  );
}
