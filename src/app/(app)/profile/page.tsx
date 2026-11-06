import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/modules/core/business/context";
import { ChangePasswordForm, ProfileForm } from "@/modules/core/profile/components";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const ctx = await getAppContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", ctx.user.id)
    .single();
  const profile = (data ?? { full_name: "", phone: null }) as {
    full_name: string;
    phone: string | null;
  };

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title="My profile" description={`${ctx.roleName} at ${ctx.business.name}`} />
      <section className="grid gap-4 rounded-lg border p-4">
        <h2 className="font-semibold">Personal details</h2>
        <ProfileForm
          fullName={profile.full_name}
          phone={profile.phone ?? ""}
          email={ctx.user.email}
        />
      </section>
      <section className="grid gap-4 rounded-lg border p-4">
        <h2 className="font-semibold">Password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
