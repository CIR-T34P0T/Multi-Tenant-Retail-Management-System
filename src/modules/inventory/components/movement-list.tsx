import Link from "next/link";
import { formatQuantity } from "@/lib/decimal";
import { when } from "@/modules/catalog/products/components/format";
import type { MovementRow } from "../queries";
import { MOVEMENT_LABELS } from "../schemas";
import { SignedQty } from "./stock-display";

/** Stock history, newest first. `showItem` adds the item name (for the all-items view). */
export function MovementList({
  rows,
  timeZone,
  showItem = false,
  label = "Stock history",
}: {
  rows: MovementRow[];
  timeZone: string;
  showItem?: boolean;
  label?: string;
}) {
  return (
    <ul className="divide-y rounded-lg border" aria-label={label}>
      {rows.map((m) => {
        const converted = m.enteredUnitCode !== m.baseUnitCode;
        return (
          <li key={m.id} className="grid gap-1 p-3 sm:grid-cols-[1fr_auto] sm:gap-4">
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
                <span>{MOVEMENT_LABELS[m.type]}</span>
                <SignedQty value={m.quantity} unit={m.baseUnitCode} />
                {converted ? (
                  <span className="text-muted-foreground text-sm font-normal">
                    ({formatQuantity(m.enteredQuantity, m.enteredUnitCode)})
                  </span>
                ) : null}
              </p>
              {showItem ? (
                <p className="truncate text-sm">
                  <Link
                    href={`/inventory/items/${m.variantId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {m.productName}
                    {m.label ? ` · ${m.label}` : ""}
                  </Link>
                </p>
              ) : null}
              {m.reason ? (
                <p className="text-muted-foreground text-sm break-words">{m.reason}</p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                {when(m.createdAt, timeZone)} · {m.by}
              </p>
            </div>
            <p className="text-muted-foreground text-sm tabular-nums sm:text-right">
              {formatQuantity(m.balanceBefore)} →{" "}
              <span className="text-foreground font-medium">
                {formatQuantity(m.balanceAfter, m.baseUnitCode)}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
