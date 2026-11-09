"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatQuantity, toDecimal } from "@/lib/decimal";
import { recordMovement } from "../actions";
import type { ItemUnit } from "../queries";
import { MOVEMENT_LABELS, isIncrease, needsReason, type ManualType } from "../schemas";

const BUTTON: Record<ManualType, string> = {
  opening: "Record opening stock",
  stock_in: "Add stock",
  stock_out: "Deduct stock",
  damaged: "Write off",
  expired: "Write off",
  missing: "Write off",
  written_off: "Write off",
};

const REASON_HINT: Partial<Record<ManualType, string>> = {
  stock_out: "e.g. used in the shop, given away, correction",
  damaged: "e.g. broken in delivery",
  expired: "e.g. past best-before date",
  missing: "e.g. not on shelf at closing",
  written_off: "Say what happened",
};

/** Typed number → exact decimal, or null while it isn't a valid number yet. */
function readNumber(text: string) {
  const cleaned = text.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return toDecimal(cleaned);
}

/**
 * Records one stock change for one item. Shows what it means in the base
 * unit (2 cartons = 24 pieces) and what stock will be afterwards. If the
 * change would take stock below zero and the business allows that, the
 * server asks for confirmation and a "Record anyway" button appears.
 */
export function MovementForm({
  variantId,
  units,
  baseUnitCode,
  onHand,
  types,
}: {
  variantId: string;
  units: ItemUnit[];
  baseUnitCode: string;
  onHand: string;
  types: ManualType[];
}) {
  const base = units.find((u) => u.isBase) ?? units[0];
  const [type, setType] = useState<ManualType>(types[0]);
  const [unitId, setUnitId] = useState(base?.unitId ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const [state, action, pending] = useFormAction(recordMovement.bind(null, variantId), {
    onSuccess: (r) => {
      toast.success(r.message);
      setQuantity("");
      setReason("");
      setUnitId(base?.unitId ?? "");
      // Opening stock is recorded once; afterwards stock is added.
      setType((t) => (t === "opening" ? "stock_in" : t));
    },
  });

  const unit = units.find((u) => u.unitId === unitId) ?? base;
  const entered = readNumber(quantity);
  const baseQty = entered && unit ? entered.mul(toDecimal(unit.factor)) : null;
  const after = baseQty ? toDecimal(onHand)[isIncrease(type) ? "plus" : "minus"](baseQty) : null;
  const errors = state.fieldErrors ?? {};
  const writeOffs = types.filter((t) => !["opening", "stock_in", "stock_out"].includes(t));

  return (
    <form onSubmit={action} className="grid gap-4" noValidate aria-label="Change stock">
      <div className="grid gap-2">
        <Label htmlFor="movement-type">What happened?</Label>
        <NativeSelect
          id="movement-type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as ManualType)}
          className="h-11 md:h-9"
        >
          {types
            .filter((t) => ["opening", "stock_in", "stock_out"].includes(t))
            .map((t) => (
              <NativeSelectOption key={t} value={t}>
                {t === "opening"
                  ? "Opening stock (first count)"
                  : t === "stock_in"
                    ? "Add stock"
                    : "Deduct stock"}
              </NativeSelectOption>
            ))}
          {writeOffs.length > 0 ? (
            <NativeSelectOptGroup label="Write off">
              {writeOffs.map((t) => (
                <NativeSelectOption key={t} value={t}>
                  {t === "written_off" ? "Other loss" : MOVEMENT_LABELS[t]}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          ) : null}
        </NativeSelect>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="grid gap-2">
          <Label htmlFor="movement-quantity">Quantity</Label>
          <Input
            id="movement-quantity"
            name="quantity"
            inputMode="decimal"
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={errors.quantity ? true : undefined}
            aria-describedby="movement-preview"
            className="h-11 md:h-9"
          />
        </div>
        {units.length > 1 ? (
          <div className="grid gap-2">
            <Label htmlFor="movement-unit">Unit</Label>
            <NativeSelect
              id="movement-unit"
              name="unitId"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="h-11 md:h-9"
            >
              {units.map((u) => (
                <NativeSelectOption key={u.unitId} value={u.unitId}>
                  {u.isBase
                    ? `${u.name} (${u.code})`
                    : `${u.name} (${formatQuantity(u.factor, baseUnitCode)})`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <input type="hidden" name="unitId" value={unitId} />
        )}
        <p
          id="movement-preview"
          className="text-muted-foreground text-sm sm:col-span-2"
          aria-live="polite"
        >
          {baseQty && after ? (
            <>
              {unit && !unit.isBase
                ? `= ${formatQuantity(baseQty.toFixed(), baseUnitCode)} · `
                : ""}
              Stock will be{" "}
              <span
                className={
                  after.isNegative()
                    ? "text-destructive font-medium"
                    : "text-foreground font-medium"
                }
              >
                {formatQuantity(after.toFixed(), baseUnitCode)}
              </span>
            </>
          ) : (
            `Now in stock: ${formatQuantity(onHand, baseUnitCode)}`
          )}
        </p>
        {errors.quantity ? (
          <p className="text-destructive text-sm sm:col-span-2" role="alert">
            {errors.quantity.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="movement-reason">{needsReason(type) ? "Reason" : "Note (optional)"}</Label>
        <Textarea
          id="movement-reason"
          name="reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={REASON_HINT[type] ?? "e.g. delivery from supplier"}
          aria-invalid={errors.reason ? true : undefined}
        />
        {errors.reason ? (
          <p className="text-destructive text-sm" role="alert">
            {errors.reason.join(" ")}
          </p>
        ) : null}
      </div>

      {state.confirm ? (
        <Alert role="alert" className="border-amber-500/50">
          <TriangleAlert />
          <AlertTitle>Stock will go below zero</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{state.confirm}</p>
            <Button
              type="submit"
              name="confirmNegative"
              value="yes"
              variant="destructive"
              disabled={pending}
              className="h-11 w-fit md:h-9"
            >
              Record anyway
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <FormAlert state={state.ok ? { ok: false } : state} />
      )}
      <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
        {BUTTON[type]}
      </SubmitButton>
    </form>
  );
}
