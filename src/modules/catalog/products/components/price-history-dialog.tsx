"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type HistoryRow = {
  what: string;
  amount: string;
  from: string;
  to: string | null;
  by: string;
};

/** Read-only list of every price (and cost) a variant has had. */
export function PriceHistoryDialog({ label, rows }: { label: string; rows: HistoryRow[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 md:h-8"
          aria-label={`Price history of ${label}`}
        >
          <History /> History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Price history: {label}</DialogTitle>
          <DialogDescription>
            Newest first. Old prices are kept and never changed.
          </DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No prices yet.</p>
        ) : (
          <ul className="divide-y text-sm" aria-label="Price history">
            {rows.map((r, i) => (
              <li key={i} className="grid gap-0.5 py-2">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{r.what}</span>
                  <span className="font-medium tabular-nums">{r.amount}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {r.from} → {r.to ?? "now"} · set by {r.by}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
