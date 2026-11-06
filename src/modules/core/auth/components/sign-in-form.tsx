"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialActionResult } from "@/lib/action-result";
import { signIn } from "../actions";

const LINK_ERRORS: Record<string, string> = {
  link: "That link is invalid or has expired. Please try again.",
};

export function SignInForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(signIn, initialActionResult);
  const linkError = LINK_ERRORS[params.get("error") ?? ""];

  return (
    <form action={action} className="grid gap-4" noValidate>
      {linkError && !state.message ? <FormAlert state={{ ok: false, message: linkError }} /> : null}
      <FormAlert state={state} />
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <div className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <p className="text-muted-foreground text-center text-sm">
        New here?{" "}
        <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
