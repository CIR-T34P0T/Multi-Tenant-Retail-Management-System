"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialActionResult } from "@/lib/action-result";
import { updatePreferences } from "../../business/actions";

export type Preferences = {
  allow_negative_stock: boolean;
  low_stock_alerts_enabled: boolean;
  require_customer_on_sale: boolean;
  returns_enabled: boolean;
  max_discount_percent: string;
  cash_rounding_increment: string;
  receipt_header: string;
  receipt_footer: string;
};

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="grid gap-0.5">
        <Label htmlFor={name}>{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Switch id={name} name={name} defaultChecked={defaultChecked} />
    </div>
  );
}

export function PreferencesForm({
  prefs,
  readOnly,
  salesActive,
}: {
  prefs: Preferences;
  readOnly: boolean;
  salesActive: boolean;
}) {
  const [state, action, pending] = useActionState(updatePreferences, initialActionResult);
  return (
    <form action={action} className="grid gap-6" noValidate>
      <FormAlert state={state} />
      <fieldset disabled={readOnly} className="grid gap-6">
        <section className="grid gap-3">
          <h2 className="font-semibold">Stock</h2>
          <Toggle
            name="allowNegativeStock"
            label="Allow stock to go below zero"
            hint="Sales and deductions can still go through after a warning; the item then shows as below zero until stock is corrected."
            defaultChecked={prefs.allow_negative_stock}
          />
          <Toggle
            name="lowStockAlertsEnabled"
            label="Low-stock alerts"
            hint="Highlight products that fall below their minimum level."
            defaultChecked={prefs.low_stock_alerts_enabled}
          />
        </section>

        {salesActive ? (
          <section className="grid gap-3">
            <h2 className="font-semibold">Sales</h2>
            <Toggle
              name="requireCustomerOnSale"
              label="Require a customer on every sale"
              hint="Usually off: walk-in customers don't need a record."
              defaultChecked={prefs.require_customer_on_sale}
            />
            <Toggle
              name="returnsEnabled"
              label="Accept customer returns"
              hint="Off for your shop. When on, returns create reversal records."
              defaultChecked={prefs.returns_enabled}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Maximum discount without approval (%)"
                name="maxDiscountPercent"
                inputMode="decimal"
                defaultValue={prefs.max_discount_percent}
                errors={state.fieldErrors?.maxDiscountPercent}
                hint="0 means no discounts at the till."
              />
              <FormField
                label="Round cash totals to the nearest"
                name="cashRoundingIncrement"
                inputMode="decimal"
                defaultValue={prefs.cash_rounding_increment}
                errors={state.fieldErrors?.cashRoundingIncrement}
                hint="0 means no rounding."
              />
            </div>
          </section>
        ) : (
          <>
            <input type="hidden" name="maxDiscountPercent" value={prefs.max_discount_percent} />
            <input
              type="hidden"
              name="cashRoundingIncrement"
              value={prefs.cash_rounding_increment}
            />
          </>
        )}

        <section className="grid gap-3">
          <h2 className="font-semibold">Receipts</h2>
          <div className="grid gap-2">
            <Label htmlFor="receiptHeader">Text at the top of receipts</Label>
            <Textarea
              id="receiptHeader"
              name="receiptHeader"
              rows={2}
              maxLength={500}
              defaultValue={prefs.receipt_header}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="receiptFooter">Text at the bottom of receipts</Label>
            <Textarea
              id="receiptFooter"
              name="receiptFooter"
              rows={2}
              maxLength={500}
              defaultValue={prefs.receipt_footer}
            />
          </div>
        </section>
      </fieldset>
      {readOnly ? null : (
        <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
          Save preferences
        </SubmitButton>
      )}
    </form>
  );
}
