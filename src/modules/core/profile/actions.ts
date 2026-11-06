"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formToObject, fullNameSchema, newPasswordSchema } from "../auth/schemas";
import { requireUser } from "../session";

const profileSchema = z.object({
  fullName: fullNameSchema,
  phone: z
    .string()
    .trim()
    .max(32, { error: "Phone number is too long" })
    .transform((v) => (v === "" ? null : v)),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Enter your current password" }),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function updateProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", user.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Profile saved." };
}

export async function changePassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  // Confirm it is really the account holder before changing the password.
  const check = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (check.error)
    return { ok: false, fieldErrors: { currentPassword: ["Current password is incorrect"] } };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return {
        ok: false,
        fieldErrors: { password: ["Choose a different password from your current one"] },
      };
    }
    return { ok: false, message: "Could not change the password. Please try again." };
  }
  return { ok: true, message: "Password changed." };
}
