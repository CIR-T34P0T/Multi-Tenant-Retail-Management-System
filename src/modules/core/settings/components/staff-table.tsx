"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionResult } from "@/lib/action-result";
import { cancelInvitation, changeMemberRole, setMemberStatus } from "../../members/actions";

export type StaffMember = {
  member_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  role_id: string;
  role_name: string;
  is_owner: boolean;
  status: "invited" | "active" | "suspended";
};

const STATUS_LABEL = { invited: "Invited", active: "Active", suspended: "Suspended" } as const;

export function StaffTable({
  members,
  roles,
  canManage,
  currentUserId,
}: {
  members: StaffMember[];
  roles: { id: string; name: string; is_owner: boolean }[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  return (
    <ul className="divide-y rounded-lg border" aria-label="Staff">
      {members.map((m) => {
        const self = m.user_id === currentUserId;
        const editable = canManage && !self && !m.is_owner;
        return (
          <li key={m.member_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {m.full_name || m.email}
                {self ? (
                  <span className="text-muted-foreground text-sm font-normal"> (you)</span>
                ) : null}
              </p>
              {m.full_name ? (
                <p className="text-muted-foreground truncate text-sm">{m.email}</p>
              ) : m.status === "invited" ? (
                <p className="text-muted-foreground text-sm">Waiting for them to accept</p>
              ) : null}
            </div>
            <Badge variant={m.status === "active" ? "secondary" : "outline"} className="w-fit">
              {STATUS_LABEL[m.status]}
            </Badge>
            {editable && m.status !== "invited" ? (
              <NativeSelect
                aria-label={`Role for ${m.full_name || m.email}`}
                defaultValue={m.role_id}
                disabled={pending}
                className="h-11 sm:w-40 md:h-9"
                onChange={(e) => run(() => changeMemberRole(m.member_id, e.target.value))}
              >
                {roles
                  .filter((r) => !r.is_owner)
                  .map((r) => (
                    <NativeSelectOption key={r.id} value={r.id}>
                      {r.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            ) : (
              <span className="text-sm sm:w-40">{m.role_name}</span>
            )}
            <div className="sm:w-32 sm:text-right">
              {editable && m.status === "invited" ? (
                <Button
                  variant="outline"
                  className="h-11 md:h-8"
                  disabled={pending}
                  onClick={() => run(() => cancelInvitation(m.member_id))}
                >
                  Withdraw
                </Button>
              ) : null}
              {editable && m.status === "active" ? (
                <Button
                  variant="outline"
                  className="h-11 md:h-8"
                  disabled={pending}
                  onClick={() => run(() => setMemberStatus(m.member_id, "suspended"))}
                >
                  Suspend
                </Button>
              ) : null}
              {editable && m.status === "suspended" ? (
                <Button
                  variant="outline"
                  className="h-11 md:h-8"
                  disabled={pending}
                  onClick={() => run(() => setMemberStatus(m.member_id, "active"))}
                >
                  Restore
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
