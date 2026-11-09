import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";
import { MovementList } from "@/modules/inventory/components/movement-list";
import { PageNav } from "@/modules/inventory/components/stock-list";
import { listMovements } from "@/modules/inventory/queries";
import {
  MOVEMENT_PAGE_SIZE,
  parseMovementFilter,
  type MovementFilter,
} from "@/modules/inventory/schemas";

export const metadata: Metadata = { title: "Stock history" };

const KINDS: { kind: MovementFilter; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "in", label: "Added" },
  { kind: "out", label: "Deducted" },
  { kind: "writeoff", label: "Write-offs" },
  { kind: "count", label: "Counts" },
];

const href = (kind: MovementFilter, page = 1) => {
  const p = new URLSearchParams();
  if (kind !== "all") p.set("kind", kind);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/inventory/movements?${qs}` : "/inventory/movements";
};

export default async function MovementsPage({ searchParams }: PageProps<"/inventory/movements">) {
  const [ctx, params] = await Promise.all([getAppContext(), searchParams]);
  const back = (
    <Link
      href="/inventory"
      className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
    >
      <ArrowLeft className="size-4" /> Inventory
    </Link>
  );
  if (!ctx.can("inventory.stock.view")) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <PageHeader title="Stock history" />
        <ReadOnlyNote>You do not have permission to see stock history.</ReadOnlyNote>
      </div>
    );
  }
  const { kind, page } = parseMovementFilter(params);
  const { rows, total } = await listMovements(ctx.business.businessId, { kind, page });

  return (
    <div className="flex flex-col gap-6">
      {back}
      <PageHeader
        title="Stock history"
        description="Every stock change, newest first. Changes can never be edited or deleted."
      />
      <nav aria-label="Kind of change" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.kind}
            href={href(k.kind)}
            aria-current={k.kind === kind ? "page" : undefined}
            className={cn(
              "hover:bg-muted rounded-full border px-4 py-2 text-sm transition-colors md:py-1",
              k.kind === kind &&
                "bg-primary text-primary-foreground hover:bg-primary border-primary",
            )}
          >
            {k.label}
          </Link>
        ))}
      </nav>
      {rows.length > 0 ? (
        <>
          <MovementList rows={rows} timeZone={ctx.business.timezone} showItem />
          <PageNav
            page={page}
            total={total}
            pageSize={MOVEMENT_PAGE_SIZE}
            noun="changes"
            href={(p) => href(kind, p)}
          />
        </>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No stock changes yet.
        </p>
      )}
    </div>
  );
}
