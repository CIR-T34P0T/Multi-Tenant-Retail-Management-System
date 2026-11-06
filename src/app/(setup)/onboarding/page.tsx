import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/form-alert";
import { createClient } from "@/lib/supabase/server";
import { CreateBusinessForm } from "@/modules/core/business/components/create-business-form";
import {
  PendingInvitations,
  type PendingInvitation,
} from "@/modules/core/business/components/pending-invitations";
import { getMemberships } from "@/modules/core/business/context";
import { requireUser } from "@/modules/core/session";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  await requireUser();
  const supabase = await createClient();
  const [{ data: invitations }, memberships, params] = await Promise.all([
    supabase.rpc("my_pending_invitations"),
    getMemberships(),
    searchParams,
  ]);
  const pending = (invitations ?? []) as PendingInvitation[];

  return (
    <div className="grid gap-6">
      {params.notice === "invitation-failed" ? (
        <FormAlert state={{ ok: false, message: "That invitation is no longer available." }} />
      ) : null}
      <PendingInvitations invitations={pending} />
      <section className="bg-card grid gap-5 rounded-xl border p-5 md:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {memberships.length > 0 ? "Create another business" : "Set up your business"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {pending.length > 0
              ? "Joining a business as staff? Accept the invitation above instead."
              : "Staff joining an existing shop: ask the owner to invite your email address."}
          </p>
        </div>
        <CreateBusinessForm />
      </section>
      {memberships.length > 0 ? (
        <Link
          href="/dashboard"
          className="text-primary text-center text-sm underline-offset-4 hover:underline"
        >
          Back to my dashboard
        </Link>
      ) : null}
    </div>
  );
}
