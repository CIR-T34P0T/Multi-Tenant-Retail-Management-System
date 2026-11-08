"use client";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { StatusButton } from "@/modules/catalog/sections/components/status-button";
import { addProductUnit, setProductUnitStatus, updateProductUnitFactor } from "../actions";
import type { UnitOption } from "../queries";
import { qty } from "./format";
import { ValueDialog } from "./value-dialog";

type ProductUnit = {
  id: string;
  unitId: string;
  code: string;
  name: string;
  factor: string;
  isBase: boolean;
  status: "active" | "archived";
};

export function UnitsCard({
  productId,
  productActive,
  units,
  allUnits,
  canManage,
  canPrice,
  currency,
}: {
  productId: string;
  productActive: boolean;
  units: ProductUnit[];
  allUnits: UnitOption[];
  canManage: boolean;
  canPrice: boolean;
  currency: string;
}) {
  const base = units.find((u) => u.isBase)!;
  const used = new Set(units.map((u) => u.unitId));
  const available = allUnits.filter((u) => u.status === "active" && !used.has(u.id));
  const [state, action, pending] = useFormAction(addProductUnit.bind(null, productId), {
    resetOnSuccess: true,
  });

  return (
    <section
      className="grid gap-4 self-start rounded-lg border p-4"
      aria-labelledby="units-heading"
    >
      <h2 id="units-heading" className="font-semibold">
        Units
      </h2>
      <ul className="divide-y" aria-label="Units">
        {units.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-medium">
              {u.name} ({u.code})
            </span>
            <span className="text-muted-foreground text-sm">
              {u.isBase ? "base unit — stock is counted in this" : `= ${qty(u.factor, base.code)}`}
            </span>
            {u.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
            {canManage && productActive && !u.isBase ? (
              <span className="ml-auto flex gap-2">
                {u.status === "active" ? (
                  <ValueDialog
                    trigger="Edit"
                    triggerLabel={`Edit ${u.name}`}
                    title={`How many ${base.code} in one ${u.name.toLowerCase()}?`}
                    description="Only affects future sales and purchases."
                    fieldName="factor"
                    fieldLabel={`Quantity (${base.code})`}
                    defaultValue={qty(u.factor, "").trim()}
                    action={updateProductUnitFactor.bind(null, u.id)}
                  />
                ) : null}
                <StatusButton
                  name={u.name}
                  status={u.status}
                  explanation="This product will no longer be bought or sold in this unit."
                  onChange={setProductUnitStatus.bind(null, u.id)}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {canManage && productActive && available.length > 0 ? (
        <form onSubmit={action} className="grid gap-3 border-t pt-4" noValidate>
          <h3 className="text-sm font-medium">Add a unit</h3>
          <FormAlert state={state} />
          <div className="grid gap-2">
            <Label htmlFor="add-unit">Unit</Label>
            <NativeSelect id="add-unit" name="unitId" className="h-11 md:h-9">
              {available.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {state.fieldErrors?.unitId ? (
              <p className="text-destructive text-sm" role="alert">
                {state.fieldErrors.unitId.join(" ")}
              </p>
            ) : null}
          </div>
          <FormField
            id="add-unit-factor"
            label={`Contains (${base.code})`}
            name="factor"
            inputMode="decimal"
            placeholder="e.g. 24"
            errors={state.fieldErrors?.factor}
          />
          {canPrice ? (
            <FormField
              id="add-unit-price"
              label={`Price per unit for all variants (${currency}, optional)`}
              name="price"
              inputMode="decimal"
              errors={state.fieldErrors?.price}
            />
          ) : null}
          <SubmitButton pending={pending} variant="secondary" className="h-11 w-fit md:h-9">
            Add unit
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
