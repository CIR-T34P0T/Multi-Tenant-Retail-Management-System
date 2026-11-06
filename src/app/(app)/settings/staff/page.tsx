import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/modules/core/business/context";
import { InviteForm } from "@/modules/core/settings/components/invite-form";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";
import { StaffTable, type StaffMember } from "@/modules/core/settings/components/staff-table";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const ctx = await getAppContext();
  const canManage = ctx.can("core.member.manage");
  if (!canManage && !ctx.can("core.member.view")) {
    return <ReadOnlyNote>You do not have permission to see the staff list.</ReadOnlyNote>;
  }
  const supabase = await createClient();
  const [members, roles] = await Promise.all([
    supabase.rpc("business_member_directory", { p_business: ctx.business.businessId }),
    supabase
      .from("roles")
      .select("id, name, is_owner")
      .eq("business_id", ctx.business.businessId)
      .order("name"),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (roles.error) throw new Error(roles.error.message);
  const roleList = (roles.data ?? []) as { id: string; name: string; is_owner: boolean }[];

  return (
    <div className="grid gap-6">
      {canManage ? (
        <InviteForm roles={roleList.filter((r) => ctx.isOwner || !r.is_owner)} />
      ) : (
        <ReadOnlyNote>You can see the staff list but not change it.</ReadOnlyNote>
      )}
      <StaffTable
        members={(members.data ?? []) as StaffMember[]}
        roles={roleList}
        canManage={canManage}
        currentUserId={ctx.user.id}
      />
    </div>
  );
}
