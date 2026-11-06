"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionResult } from "@/lib/action-result";
import { updateBusinessDetails } from "../../business/actions";
import { CURRENCIES, TIMEZONES } from "../../business/options";

export type BusinessDetails = {
  name: string;
  slug: string;
  legal_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency_code: string;
  timezone: string;
};

export function BusinessDetailsForm({
  business,
  readOnly,
}: {
  business: BusinessDetails;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(updateBusinessDetails, initialActionResult);
  const currency =
    CURRENCIES.find((c) => c.value === business.currency_code)?.label ?? business.currency_code;
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormAlert state={state} />
      <fieldset disabled={readOnly} className="grid gap-5">
        <FormField
          label="Business name"
          name="name"
          defaultValue={business.name}
          required
          errors={state.fieldErrors?.name}
        />
        <FormField
          label="Registered (legal) name"
          name="legalName"
          defaultValue={business.legal_name ?? ""}
          errors={state.fieldErrors?.legalName}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            defaultValue={business.phone ?? ""}
            errors={state.fieldErrors?.phone}
          />
          <FormField
            label="Email"
            name="email"
            type="email"
            defaultValue={business.email ?? ""}
            errors={state.fieldErrors?.email}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" name="address" rows={2} defaultValue={business.address ?? ""} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="timezone">Time zone</Label>
            <NativeSelect
              id="timezone"
              name="timezone"
              defaultValue={business.timezone}
              className="h-11 md:h-9"
            >
              {TIMEZONES.map((t) => (
                <NativeSelectOption key={t.value} value={t.value}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label>Currency</Label>
            <p className="bg-muted flex h-11 items-center rounded-md px-3 text-sm md:h-9">
              {currency}
            </p>
            <p className="text-muted-foreground text-xs">
              Fixed when the business was created, so past amounts stay correct.
            </p>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Business address (short name): {business.slug}
        </p>
      </fieldset>
      {readOnly ? null : (
        <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
          Save details
        </SubmitButton>
      )}
    </form>
  );
}
