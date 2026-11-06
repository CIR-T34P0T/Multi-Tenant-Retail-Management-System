"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { initialActionResult } from "@/lib/action-result";
import { createRole, updateRolePermissions } from "../../roles/actions";

export type PermissionInfo = {
  code: string;
  description: string;
  module: string;
  moduleName: string;
  sensitive: boolean;
};
export type RoleInfo = {
  id: string;
  name: string;
  description: string;
  is_owner: boolean;
  permissions: string[];
};

export function NewRoleForm() {
  const [state, action, pending] = useActionState(createRole, initialActionResult);
  return (
    <form action={action} className="grid gap-3 rounded-lg border p-4" noValidate>
      <h2 className="font-semibold">Create a role</h2>
      <FormAlert state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField
          label="Role name"
          name="name"
          className="flex-1"
          placeholder="e.g. Store keeper"
          errors={state.fieldErrors?.name}
        />
        <SubmitButton pending={pending}>Create</SubmitButton>
      </div>
    </form>
  );
}

export function RoleEditor({
  role,
  catalogue,
  canManage,
}: {
  role: RoleInfo;
  catalogue: PermissionInfo[];
  canManage: boolean;
}) {
  const [selected, setSelected] = useState(new Set(role.permissions));
  const [pending, start] = useTransition();
  const modules = [...new Set(catalogue.map((p) => p.moduleName))];
  const dirty =
    selected.size !== role.permissions.length || role.permissions.some((p) => !selected.has(p));

  if (role.is_owner) {
    return (
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">{role.name}</summary>
        <p className="text-muted-foreground mt-2 text-sm">
          The owner always has every permission. This role cannot be changed.
        </p>
      </details>
    );
  }

  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">
        {role.name}{" "}
        <span className="text-muted-foreground text-sm font-normal">
          · {selected.size} permissions
        </span>
      </summary>
      {role.description ? (
        <p className="text-muted-foreground mt-2 text-sm">{role.description}</p>
      ) : null}
      <fieldset disabled={!canManage || pending} className="mt-4 grid gap-5">
        {modules.map((mod) => (
          <div key={mod} className="grid gap-2">
            <h3 className="text-sm font-medium">{mod}</h3>
            {catalogue
              .filter((p) => p.moduleName === mod)
              .map((p) => (
                <label key={p.code} className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={selected.has(p.code)}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v === true) next.add(p.code);
                      else next.delete(p.code);
                      setSelected(next);
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    {p.description}
                    {p.sensitive ? (
                      <Badge variant="outline" className="ml-2">
                        sensitive
                      </Badge>
                    ) : null}
                  </span>
                </label>
              ))}
          </div>
        ))}
      </fieldset>
      {canManage ? (
        <Button
          className="mt-4 h-11 md:h-9"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await updateRolePermissions(role.id, [...selected]);
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            })
          }
        >
          Save {role.name} permissions
        </Button>
      ) : null}
    </details>
  );
}
