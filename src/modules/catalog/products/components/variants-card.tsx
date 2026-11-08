"use client";

import { Badge } from "@/components/ui/badge";
import { StatusButton } from "@/modules/catalog/sections/components/status-button";
import { setCost, setPrice, setVariantStatus } from "../actions";
import type { CostEntry, PriceEntry } from "../queries";
import { variantLabel } from "../variants";
import { money, qty, when } from "./format";
import { PriceHistoryDialog, type HistoryRow } from "./price-history-dialog";
import { AddVariantDialog, EditVariantDialog } from "./variant-dialogs";
import { ValueDialog } from "./value-dialog";

type Unit = {
  unitId: string;
  code: string;
  name: string;
  isBase: boolean;
  status: "active" | "archived";
};
type Variant = {
  id: string;
  sku: string;
  barcode: string | null;
  optionValues: string[];
  minStock: string;
  status: "active" | "archived";
};

/**
 * Variants with their current prices (one per unit), cost, stock alert level
 * and full price history. Buttons appear only for what the person may do;
 * the server and database check again.
 */
export function VariantsCard({
  productId,
  productActive,
  optionNames,
  variants,
  units,
  prices,
  costs,
  currency,
  timeZone,
  canManage,
  canPrice,
  canSeePrices,
  canSeeCost,
  canCost,
}: {
  productId: string;
  productActive: boolean;
  optionNames: string[];
  variants: Variant[];
  units: Unit[];
  prices: PriceEntry[];
  costs: CostEntry[];
  currency: string;
  timeZone: string;
  canManage: boolean;
  canPrice: boolean;
  canSeePrices: boolean;
  canSeeCost: boolean;
  canCost: boolean;
}) {
  const base = units.find((u) => u.isBase)!;
  const activeUnits = units.filter((u) => u.status === "active");
  const unitName = new Map(units.map((u) => [u.unitId, u]));
  const current = (variantId: string, unitId: string) =>
    prices.find((p) => p.variantId === variantId && p.unitId === unitId && p.to === null)?.price ??
    null;
  const currentCost = (variantId: string) =>
    costs.find((c) => c.variantId === variantId && c.to === null)?.cost ?? null;

  const history = (variantId: string): HistoryRow[] =>
    [
      ...prices
        .filter((p) => p.variantId === variantId)
        .map((p) => ({
          at: p.from,
          what: `Price per ${unitName.get(p.unitId)?.name.toLowerCase() ?? "unit"}`,
          amount: money(p.price, currency),
          from: when(p.from, timeZone),
          to: p.to ? when(p.to, timeZone) : null,
          by: p.setBy,
        })),
      ...costs
        .filter((c) => c.variantId === variantId)
        .map((c) => ({
          at: c.from,
          what: `Cost per ${base.name.toLowerCase()}`,
          amount: money(c.cost, currency),
          from: when(c.from, timeZone),
          to: c.to ? when(c.to, timeZone) : null,
          by: c.setBy,
        })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((row) => ({
        what: row.what,
        amount: row.amount,
        from: row.from,
        to: row.to,
        by: row.by,
      }));

  return (
    <section className="grid gap-4 rounded-lg border p-4" aria-labelledby="variants-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="variants-heading" className="font-semibold">
          {optionNames.length > 0 ? `Variants (${optionNames.join(" × ")})` : "Price and code"}
        </h2>
        {canManage && productActive && optionNames.length > 0 ? (
          <AddVariantDialog
            productId={productId}
            optionNames={optionNames}
            baseUnitCode={base.code}
            currency={currency}
            canPrice={canPrice}
            canCost={canCost}
          />
        ) : null}
      </div>
      <ul className="grid gap-3" aria-label="Variants">
        {variants.map((v) => {
          const label = variantLabel(v.optionValues);
          const editable = v.status === "active";
          return (
            <li key={v.id} className="grid gap-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{label}</span>
                <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{v.sku}</code>
                {v.barcode ? (
                  <span className="text-muted-foreground text-xs">Barcode {v.barcode}</span>
                ) : null}
                {v.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
              </div>

              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {canSeePrices
                  ? activeUnits.map((u) => {
                      const value = current(v.id, u.unitId);
                      return (
                        <div
                          key={u.unitId}
                          className="flex items-center justify-between gap-2 sm:justify-start"
                        >
                          <dt className="text-muted-foreground whitespace-nowrap">
                            Price per {u.name.toLowerCase()}
                          </dt>
                          <dd className="flex items-center gap-2 font-medium tabular-nums">
                            {money(value, currency)}
                            {canPrice && editable && productActive ? (
                              <ValueDialog
                                trigger="Change"
                                triggerLabel={`Change ${u.name.toLowerCase()} price of ${label}`}
                                title={`Price per ${u.name.toLowerCase()}: ${label}`}
                                description="The old price is kept in the history; past sales are not affected."
                                fieldName="price"
                                fieldLabel={`New price (${currency})`}
                                defaultValue={value ?? ""}
                                action={setPrice.bind(null, v.id, u.unitId)}
                              />
                            ) : null}
                          </dd>
                        </div>
                      );
                    })
                  : null}
                {canSeeCost ? (
                  <div className="flex items-center justify-between gap-2 sm:justify-start">
                    <dt className="text-muted-foreground whitespace-nowrap">
                      Cost per {base.name.toLowerCase()}
                    </dt>
                    <dd className="flex items-center gap-2 font-medium tabular-nums">
                      {money(currentCost(v.id), currency)}
                      {canCost && editable && productActive ? (
                        <ValueDialog
                          trigger="Change"
                          triggerLabel={`Change cost of ${label}`}
                          title={`Cost per ${base.name.toLowerCase()}: ${label}`}
                          description="Used for margins until real purchase costs are recorded."
                          fieldName="cost"
                          fieldLabel={`New cost (${currency})`}
                          defaultValue={currentCost(v.id) ?? ""}
                          action={setCost.bind(null, v.id)}
                        />
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2 sm:justify-start">
                  <dt className="text-muted-foreground whitespace-nowrap">Low-stock alert at</dt>
                  <dd className="font-medium tabular-nums">{qty(v.minStock, base.code)}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                {canSeePrices ? <PriceHistoryDialog label={label} rows={history(v.id)} /> : null}
                {canManage && editable && productActive ? (
                  <EditVariantDialog
                    variant={v}
                    label={label}
                    optionNames={optionNames}
                    baseUnitCode={base.code}
                  />
                ) : null}
                {canManage && productActive && variants.length > 1 ? (
                  <StatusButton
                    name={`${label} (${v.sku})`}
                    status={v.status}
                    explanation="It will no longer be offered for sale or stock entry."
                    onChange={setVariantStatus.bind(null, v.id)}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
