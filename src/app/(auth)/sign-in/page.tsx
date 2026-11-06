import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/forms/auth-heading";
import { SignInForm } from "@/modules/core/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back. Sign in to manage your shop." />
      {/* The form reads ?next= and ?error= from the address, so it streams in. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </>
  );
}
