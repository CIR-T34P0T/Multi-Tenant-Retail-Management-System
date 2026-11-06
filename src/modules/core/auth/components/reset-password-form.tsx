"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialActionResult } from "@/lib/action-result";
import { resetPassword } from "../actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, initialActionResult);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <FormField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.password}
        hint="At least 10 characters."
      />
      <FormField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending}>Save new password</SubmitButton>
    </form>
  );
}
