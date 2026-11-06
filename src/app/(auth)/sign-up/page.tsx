import type { Metadata } from "next";
import { AuthHeading } from "@/components/forms/auth-heading";
import { SignUpForm } from "@/modules/core/auth/components/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading
        title="Create your account"
        description="Business owners and staff both start here."
      />
      <SignUpForm />
    </>
  );
}
