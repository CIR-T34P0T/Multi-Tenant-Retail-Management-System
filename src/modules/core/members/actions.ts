"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, fieldErrors, formToObject } from "../auth/schemas";
import { getAppContext } from "../business/context";

const inviteSchema = z.object({
  email: emailSchema,
  roleId: z.uuid({ error: "Choose a role" }),
});

async function requireStaffManager() {
  const ctx = await getAppContext();
  return ctx.can("core.member.manage") ? ctx : null;
}

export async function inviteMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffManager();
  if (!ctx) return { ok: false, message: "You do not have permission to manage staff." };
  const parsed = inviteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_member", {
    p_business: ctx.business.businessId,
    p_email: parsed.data.email,
    p_role: parsed.data.roleId,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return {
    ok: true,
    message: `Invitation saved. Ask ${parsed.data.email} to create an account (or sign in) with that email — they will see the invitation.`,
  };
}

export async function cancelInvitation(memberId: string): Promise<ActionResult> {
  if (!(await requireStaffManager()))
    return { ok: false, message: "You do not have permission to manage staff." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invitation", { p_member: memberId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Invitation withdrawn." };
}

export async function changeMemberRole(memberId: string, roleId: string): Promise<ActionResult> {
  const ctx = await requireStaffManager();
  if (!ctx) return { ok: false, message: "You do not have permission to manage staff." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .update({ role_id: roleId })
    .eq("id", memberId)
    .eq("business_id", ctx.business.businessId)
    .select("id");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "That staff member could not be updated." };
  refresh();
  return { ok: true, message: "Role updated." };
}

export async function setMemberStatus(
  memberId: string,
  status: "active" | "suspended",
): Promise<ActionResult> {
  const ctx = await requireStaffManager();
  if (!ctx) return { ok: false, message: "You do not have permission to manage staff." };
  if (status !== "active" && status !== "suspended")
    return { ok: false, message: "Invalid status." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .update({ status })
    .eq("id", memberId)
    .eq("business_id", ctx.business.businessId)
    .neq("status", "invited")
    .select("id");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "That staff member could not be updated." };
  refresh();
  return {
    ok: true,
    message: status === "suspended" ? "Access suspended immediately." : "Access restored.",
  };
}
