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
import type { ProductListRow, SectionChoice } from "../queries";
import { PAGE_SIZE, type ProductListFilter } from "../schemas";
import { money } from "./format";

/** Search and filters live in the web address, so they can be bookmarked. */
export function ProductFilterForm({
  filter,
  sections,
}: {
  filter: ProductListFilter;
  sections: SectionChoice[];
}) {
  const active =
    filter.q !== "" || filter.sectionId || filter.categoryId || filter.status !== "active";
  return (
    <form
      method="get"
      action="/products"
      role="search"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_8rem_auto] lg:items-end"
    >
      <div className="grid gap-2">
        <Label htmlFor="products-q">Search</Label>
        <Input
          id="products-q"
          name="q"
          type="search"
          defaultValue={filter.q}
          placeholder="Name, brand, product code or barcode"
          className="h-11 md:h-9"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="products-section">Section</Label>
        <NativeSelect
          id="products-section"
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
        <Label htmlFor="products-category">Category</Label>
        <NativeSelect
          id="products-category"
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
        <Label htmlFor="products-status">Show</Label>
        <NativeSelect
          id="products-status"
          name="status"
          defaultValue={filter.status}
          className="h-11 md:h-9"
        >
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="archived">Archived</NativeSelectOption>
          <NativeSelectOption value="all">All</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="h-11 md:h-9">
          <Search /> Search
        </Button>
        {active ? (
          <Button asChild variant="ghost" className="h-11 md:h-9">
            <Link href="/products">Clear</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function ProductList({
  rows,
  currency,
  showPrices,
}: {
  rows: ProductListRow[];
  currency: string;
  showPrices: boolean;
}) {
  return (
    <ul className="divide-y rounded-lg border" aria-label="Products">
      {rows.map((p) => (
        <li key={p.id}>
          <Link
            href={`/products/${p.id}`}
            className="hover:bg-muted/50 flex items-center gap-3 p-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {p.name}
                {p.brand ? (
                  <span className="text-muted-foreground font-normal"> · {p.brand}</span>
                ) : null}
              </p>
              <p className="text-muted-foreground truncate text-sm">
                {p.sectionName}
                {p.categoryName ? ` › ${p.categoryName}` : ""} · {p.activeVariants}{" "}
                {p.activeVariants === 1 ? "variant" : "variants"}
              </p>
            </div>
            {showPrices ? (
              <span className="shrink-0 text-right text-sm tabular-nums">
                {p.priceFrom === null
                  ? "No price"
                  : p.priceFrom === p.priceTo
                    ? money(p.priceFrom, currency)
                    : `${money(p.priceFrom, currency)} – ${money(p.priceTo, currency)}`}
                <span className="text-muted-foreground block text-xs">per {p.baseUnitCode}</span>
              </span>
            ) : null}
            {p.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Pagination({ filter, total }: { filter: ProductListFilter; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (page: number) => {
    const params = new URLSearchParams();
    if (filter.q) params.set("q", filter.q);
    if (filter.sectionId) params.set("section", filter.sectionId);
    if (filter.categoryId) params.set("category", filter.categoryId);
    if (filter.status !== "active") params.set("status", filter.status);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/products?${qs}` : "/products";
  };
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pages">
      {filter.page > 1 ? (
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link href={href(filter.page - 1)}>Previous</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground text-sm">
        Page {Math.min(filter.page, pages)} of {pages} · {total} products
      </span>
      {filter.page < pages ? (
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link href={href(filter.page + 1)}>Next</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
