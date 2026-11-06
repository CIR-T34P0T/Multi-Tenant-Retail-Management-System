"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialActionResult } from "@/lib/action-result";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialActionResult);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      {state.ok ? null : (
        <>
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            errors={state.fieldErrors?.email}
          />
          <SubmitButton pending={pending}>Send reset link</SubmitButton>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
