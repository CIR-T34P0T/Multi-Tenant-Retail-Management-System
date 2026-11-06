"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionResult } from "@/lib/action-result";
import { inviteMember } from "../../members/actions";

export function InviteForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(inviteMember, initialActionResult);
  const defaultRole = roles.find((r) => r.name === "Attendant")?.id ?? roles[0]?.id;
  return (
    <form action={action} className="grid gap-4 rounded-lg border p-4" noValidate>
      <h2 className="font-semibold">Invite a staff member</h2>
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FormField
          label="Their email address"
          name="email"
          type="email"
          required
          errors={state.fieldErrors?.email}
        />
        <div className="grid gap-2">
          <Label htmlFor="roleId">Role</Label>
          <NativeSelect
            id="roleId"
            name="roleId"
            defaultValue={defaultRole}
            className="h-11 md:h-9"
          >
            {roles.map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                {r.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        They create an account (or sign in) with this email and accept the invitation. No email is
        sent automatically: let them know directly.
      </p>
      <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
        Save invitation
      </SubmitButton>
    </form>
  );
}
