"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialActionResult } from "@/lib/action-result";
import { changePassword, updateProfile } from "./actions";

export function ProfileForm({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, initialActionResult);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <FormField
        label="Your name"
        name="fullName"
        defaultValue={fullName}
        autoComplete="name"
        errors={state.fieldErrors?.fullName}
      />
      <FormField
        label="Phone (optional)"
        name="phone"
        type="tel"
        defaultValue={phone}
        autoComplete="tel"
        errors={state.fieldErrors?.phone}
      />
      <FormField
        label="Email"
        name="emailDisplay"
        value={email}
        readOnly
        disabled
        hint="Your sign-in email cannot be changed here."
      />
      <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
        Save profile
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initialActionResult);
  return (
    <form action={action} className="grid gap-4" noValidate key={state.ok ? "done" : "form"}>
      <FormAlert state={state} />
      <FormField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        errors={state.fieldErrors?.currentPassword}
      />
      <FormField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        errors={state.fieldErrors?.password}
      />
      <FormField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
        Change password
      </SubmitButton>
    </form>
  );
}
