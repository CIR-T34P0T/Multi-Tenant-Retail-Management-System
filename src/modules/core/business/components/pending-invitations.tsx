import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptInvitation, declineInvitation } from "../actions";

export type PendingInvitation = {
  member_id: string;
  business_name: string;
  role_name: string;
};

export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  if (invitations.length === 0) return null;
  return (
    <section
      className="bg-card grid gap-3 rounded-xl border p-5"
      aria-labelledby="invitations-heading"
    >
      <h2 id="invitations-heading" className="flex items-center gap-2 font-semibold">
        <Mail className="size-4" /> You have been invited
      </h2>
      {invitations.map((inv) => (
        <div
          key={inv.member_id}
          className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{inv.business_name}</p>
            <p className="text-muted-foreground text-sm">Role: {inv.role_name}</p>
          </div>
          <div className="flex gap-2">
            <form action={declineInvitation}>
              <input type="hidden" name="memberId" value={inv.member_id} />
              <Button variant="outline" className="h-11 md:h-9">
                Decline
              </Button>
            </form>
            <form action={acceptInvitation}>
              <input type="hidden" name="memberId" value={inv.member_id} />
              <Button className="h-11 md:h-9">Accept and join</Button>
            </form>
          </div>
        </div>
      ))}
    </section>
  );
}
