import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { SectionChoice } from "@/modules/catalog/products/queries";
import type { StockRow } from "../queries";
import { STOCK_PAGE_SIZE, stockFilterHref, type StockFilter } from "../schemas";
import { Qty, StockStatusBadge } from "./stock-display";

/** The numbers at the top; each one is a link to the matching list. */
export function StockSummary({
  summary,
  filter,
}: {
  summary: { items: number; low: number; out: number; negative: number };
  filter: StockFilter;
}) {
  const base: StockFilter = { ...filter, status: "all", archived: false, page: 1 };
  const tiles = [
    { label: "Items", value: summary.items, status: "all" as const, tone: "" },
    {
      label: "Low stock",
      value: summary.low,
      status: "low" as const,
      tone: "text-amber-700 dark:text-amber-300",
    },
    { label: "Out of stock", value: summary.out, status: "out" as const, tone: "text-destructive" },
    {
      label: "Below zero",
      value: summary.negative,
      status: "negative" as const,
      tone: "text-destructive",
    },
  ];
  return (
    <nav aria-label="Stock summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => {
        const current = !filter.archived && filter.status === t.status;
        return (
          <Link
            key={t.label}
            href={stockFilterHref({ ...base, status: t.status })}
            aria-current={current ? "page" : undefined}
            className={cn(
              "hover:bg-muted/50 rounded-lg border p-3 transition-colors",
              current && "border-primary ring-primary/30 ring-2",
            )}
          >
            <span className="text-muted-foreground block text-sm">{t.label}</span>
            <span className={cn("text-2xl font-semibold tabular-nums", t.value > 0 && t.tone)}>
              {t.value}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Search and filters live in the web address, so they can be bookmarked. */
export function StockFilterForm({
  filter,
  sections,
}: {
  filter: StockFilter;
  sections: SectionChoice[];
}) {
  const active =
    filter.q !== "" ||
    filter.sectionId ||
    filter.categoryId ||
    filter.status !== "all" ||
    filter.archived;
  return (
    <form
      method="get"
      action="/inventory"
      role="search"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_9rem_auto] lg:items-end"
    >
      <div className="grid gap-2">
        <Label htmlFor="stock-q">Search</Label>
        <Input
          id="stock-q"
          name="q"
          type="search"
          defaultValue={filter.q}
          placeholder="Name, brand, product code or barcode"
          className="h-11 md:h-9"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="stock-section">Section</Label>
        <NativeSelect
          id="stock-section"
          name="section"
          defaultValue={filter.sectionId ?? ""}
          className="h-11 md:h-9"
        >
          <NativeSelectOption value="">All sections</NativeSelectOption>
          {sections.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="stock-category">Category</Label>
        <NativeSelect
          id="stock-category"
          name="category"
          defaultValue={filter.categoryId ?? ""}
          className="h-11 md:h-9"
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {sections
            .filter((s) => s.categories.length > 0)
            .map((s) => (
              <NativeSelectOptGroup key={s.id} label={s.name}>
                {s.categories.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="stock-status">Stock</Label>
        <NativeSelect
          id="stock-status"
          name="status"
          defaultValue={filter.status}
          className="h-11 md:h-9"
        >
          <NativeSelectOption value="all">Any level</NativeSelectOption>
          <NativeSelectOption value="low">Low stock</NativeSelectOption>
          <NativeSelectOption value="out">Out of stock</NativeSelectOption>
          <NativeSelectOption value="negative">Below zero</NativeSelectOption>
          <NativeSelectOption value="ok">In stock</NativeSelectOption>
        </NativeSelect>
      </div>
      {filter.archived ? <input type="hidden" name="archived" value="1" /> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="h-11 md:h-9">
          <Search /> Search
        </Button>
        {active ? (
          <Button asChild variant="ghost" className="h-11 md:h-9">
            <Link href="/inventory">Clear</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function StockList({ rows }: { rows: StockRow[] }) {
  return (
    <ul className="divide-y rounded-lg border" aria-label="Stock">
      {rows.map((r) => (
        <li key={r.variantId}>
          <Link
            href={`/inventory/items/${r.variantId}`}
            className="hover:bg-muted/50 flex items-center gap-3 p-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.productName}
                {r.label ? <span className="font-normal"> · {r.label}</span> : null}
              </p>
              <p className="text-muted-foreground truncate text-sm">
                <span className="font-mono text-xs">{r.sku}</span> · {r.sectionName}
                {r.categoryName ? ` › ${r.categoryName}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <Qty value={r.onHand} unit={r.unitCode} className="font-semibold" />
              {r.isActive ? (
                <StockStatusBadge status={r.status} />
              ) : (
                <Badge variant="outline">Archived</Badge>
              )}
            </div>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PageNav({
  page,
  total,
  pageSize = STOCK_PAGE_SIZE,
  noun,
  href,
}: {
  page: number;
  total: number;
  pageSize?: number;
  noun: string;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pages">
      {page > 1 ? (
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link href={href(page - 1)}>Previous</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground text-sm">
        Page {Math.min(page, pages)} of {pages} · {total} {noun}
      </span>
      {page < pages ? (
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link href={href(page + 1)}>Next</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
