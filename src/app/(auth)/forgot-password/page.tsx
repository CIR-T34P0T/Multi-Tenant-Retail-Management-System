import type { Metadata } from "next";
import { AuthHeading } from "@/components/forms/auth-heading";
import { ForgotPasswordForm } from "@/modules/core/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="Enter your email and we will send you a link to choose a new password."
      />
      <ForgotPasswordForm />
    </>
  );
}
