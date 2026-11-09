import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatQuantity, toDecimal } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import type { StockStatus } from "../schemas";

const STATUS: Record<StockStatus, { label: string; className: string }> = {
  ok: { label: "In stock", className: "border-transparent bg-primary/10 text-primary" },
  low: {
    label: "Low stock",
    className: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  out: {
    label: "Out of stock",
    className: "border-transparent bg-destructive/10 text-destructive",
  },
  negative: {
    label: "Below zero",
    className: "border-transparent bg-destructive text-white dark:bg-destructive/80",
  },
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const s = STATUS[status];
  return (
    <Badge variant="outline" className={cn("shrink-0", s.className)}>
      {s.label}
    </Badge>
  );
}

/** "24 pc" — exact, from a decimal string. */
export function Qty({
  value,
  unit,
  className,
}: {
  value: string;
  unit: string;
  className?: string;
}) {
  return <span className={cn("tabular-nums", className)}>{formatQuantity(value, unit)}</span>;
}

/** "+24 pc" / "−12 pc" with an arrow, for movements. */
export function SignedQty({ value, unit }: { value: string; unit: string }) {
  const d = toDecimal(value);
  const up = d.gt(0);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tabular-nums",
        up ? "text-primary" : "text-destructive",
      )}
    >
      {up ? (
        <ArrowUp className="size-3.5" aria-hidden />
      ) : (
        <ArrowDown className="size-3.5" aria-hidden />
      )}
      {up ? "+" : "−"}
      {formatQuantity(d.abs().toFixed(), unit)}
    </span>
  );
}
