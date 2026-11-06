"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { getPublicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_BUSINESS_COOKIE } from "../business/active";
import {
  fieldErrors,
  forgotPasswordSchema,
  formToObject,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

/**
 * Sign-in related Server Actions. Messages are deliberately general where a
 * specific one would reveal whether an email address has an account.
 */

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ok: false, message: "Please confirm your email address first. Check your inbox." };
    }
    if (error.status === 429) {
      return { ok: false, message: "Too many attempts. Please wait a minute and try again." };
    }
    return { ok: false, message: "Email or password is incorrect." };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/onboarding`,
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, fieldErrors: { password: ["Choose a stronger password"] } };
    }
    if (error.status === 429) {
      return { ok: false, message: "Too many attempts. Please wait a minute and try again." };
    }
    return {
      ok: false,
      message: "We could not create the account. If you already have one, sign in instead.",
    };
  }

  // When email confirmation is switched on, there is no session yet.
  if (!data.session) {
    return {
      ok: true,
      message: "Almost done: we sent a confirmation link to your email. Open it to continue.",
    };
  }

  redirect("/onboarding");
}

export async function requestPasswordReset(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });

  if (error?.status === 429) {
    return { ok: false, message: "Too many requests. Please wait a minute and try again." };
  }
  // Same answer whether or not the account exists.
  return {
    ok: true,
    message: "If an account exists for that email, we sent a link to reset the password.",
  };
}

export async function resetPassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return {
        ok: false,
        fieldErrors: { password: ["Choose a different password from your current one"] },
      };
    }
    return { ok: false, message: "The reset link has expired. Please request a new one." };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_BUSINESS_COOKIE);
  redirect("/sign-in");
}
