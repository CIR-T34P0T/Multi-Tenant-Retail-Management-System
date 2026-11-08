"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { addVariant, updateVariant } from "../actions";

type Props = {
  optionNames: string[];
  baseUnitCode: string;
  currency: string;
};

function useClosingAction(
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>,
  close: () => void,
) {
  return useFormAction(action, {
    onSuccess: (result) => {
      toast.success(result.message);
      close();
    },
  });
}

function OptionFields({
  optionNames,
  values,
  errors,
  idPrefix,
}: {
  optionNames: string[];
  values?: string[];
  errors?: string[];
  idPrefix: string;
}) {
  if (optionNames.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {optionNames.map((name, i) => (
        <FormField
          key={name}
          id={`${idPrefix}-option-${i}`}
          label={name}
          name="optionValue"
          maxLength={30}
          defaultValue={values?.[i]}
        />
      ))}
      {errors?.length ? (
        <p className="text-destructive text-sm sm:col-span-3" role="alert">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function AddVariantDialog({
  productId,
  optionNames,
  baseUnitCode,
  currency,
  canPrice,
  canCost,
}: Props & { productId: string; canPrice: boolean; canCost: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useClosingAction(addVariant.bind(null, productId), () =>
    setOpen(false),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 w-fit md:h-9">
          <Plus /> Add variant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a variant</DialogTitle>
          <DialogDescription>For example a new size or colour.</DialogDescription>
        </DialogHeader>
        <form onSubmit={action} className="grid gap-4" noValidate>
          {state.ok ? null : <FormAlert state={state} />}
          <OptionFields
            optionNames={optionNames}
            errors={state.fieldErrors?.optionValues}
            idPrefix="new-variant"
          />
          <FormField
            id="new-variant-sku"
            label="Product code (SKU)"
            name="sku"
            maxLength={40}
            hint="Leave empty to create one automatically."
            errors={state.fieldErrors?.sku}
          />
          <FormField
            id="new-variant-barcode"
            label="Barcode (optional)"
            name="barcode"
            maxLength={32}
            errors={state.fieldErrors?.barcode}
          />
          {canPrice ? (
            <FormField
              id="new-variant-price"
              label={`Price per ${baseUnitCode} (${currency})`}
              name="price"
              inputMode="decimal"
              errors={state.fieldErrors?.price}
            />
          ) : null}
          {canCost ? (
            <FormField
              id="new-variant-cost"
              label={`Cost per ${baseUnitCode} (${currency})`}
              name="cost"
              inputMode="decimal"
              errors={state.fieldErrors?.cost}
            />
          ) : null}
          <FormField
            id="new-variant-min"
            label={`Low-stock alert at (${baseUnitCode})`}
            name="minStock"
            inputMode="decimal"
            placeholder="0"
            errors={state.fieldErrors?.minStock}
          />
          <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
            Add variant
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditVariantDialog({
  variant,
  label,
  optionNames,
  baseUnitCode,
}: Omit<Props, "currency"> & {
  label: string;
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    optionValues: string[];
    minStock: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useClosingAction(updateVariant.bind(null, variant.id), () =>
    setOpen(false),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 md:h-8" aria-label={`Edit ${label}`}>
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {label}</DialogTitle>
        </DialogHeader>
        <form onSubmit={action} className="grid gap-4" noValidate>
          {state.ok ? null : <FormAlert state={state} />}
          <OptionFields
            optionNames={optionNames}
            values={variant.optionValues}
            errors={state.fieldErrors?.optionValues}
            idPrefix={`variant-${variant.id}`}
          />
          <FormField
            id={`variant-${variant.id}-sku`}
            label="Product code (SKU)"
            name="sku"
            maxLength={40}
            defaultValue={variant.sku}
            errors={state.fieldErrors?.sku}
          />
          <FormField
            id={`variant-${variant.id}-barcode`}
            label="Barcode"
            name="barcode"
            maxLength={32}
            defaultValue={variant.barcode ?? ""}
            errors={state.fieldErrors?.barcode}
          />
          <FormField
            id={`variant-${variant.id}-min`}
            label={`Low-stock alert at (${baseUnitCode})`}
            name="minStock"
            inputMode="decimal"
            defaultValue={variant.minStock}
            errors={state.fieldErrors?.minStock}
          />
          <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
            Save variant
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
