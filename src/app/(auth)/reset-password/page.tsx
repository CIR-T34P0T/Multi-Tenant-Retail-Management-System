import type { Metadata } from "next";
import { AuthHeading } from "@/components/forms/auth-heading";
import { ResetPasswordForm } from "@/modules/core/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from the email link; the proxy requires the session that link created. */
export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading title="Choose a new password" />
      <ResetPasswordForm />
    </>
  );
}
