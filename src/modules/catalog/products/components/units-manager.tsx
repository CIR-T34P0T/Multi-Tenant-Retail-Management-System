"use client";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { StatusButton } from "@/modules/catalog/sections/components/status-button";
import { createUnit, setUnitStatus } from "../actions";
import type { UnitOption } from "../queries";

const KINDS = [
  ["count", "Count (pieces, packs…)"],
  ["mass", "Weight"],
  ["volume", "Volume"],
  ["length", "Length"],
  ["other", "Other"],
] as const;

export function UnitsManager({ units, canManage }: { units: UnitOption[]; canManage: boolean }) {
  const [state, action, pending] = useFormAction(createUnit, { resetOnSuccess: true });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <ul className="divide-y self-start rounded-lg border" aria-label="Units">
        {units.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 p-3">
            <span className="font-medium">{u.name}</span>
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{u.code}</code>
            <span className="text-muted-foreground text-sm">
              {KINDS.find(([k]) => k === u.kind)?.[1] ?? u.kind}
              {u.allowsDecimal ? " · decimals allowed" : " · whole numbers"}
            </span>
            {u.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
            {canManage ? (
              <span className="ml-auto">
                <StatusButton
                  name={u.name}
                  status={u.status}
                  explanation="It will no longer be offered for new products. Products already using it keep it."
                  onChange={setUnitStatus.bind(null, u.id)}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form onSubmit={action} className="grid gap-4 self-start rounded-lg border p-4" noValidate>
          <h2 className="font-semibold">Add a unit</h2>
          <FormAlert state={state} />
          <FormField
            id="unit-name"
            label="Name"
            name="name"
            maxLength={40}
            placeholder="e.g. Sachet"
            errors={state.fieldErrors?.name}
          />
          <FormField
            id="unit-code"
            label="Symbol"
            name="code"
            maxLength={12}
            placeholder="e.g. sachet"
            hint="Short, lowercase; shown next to quantities. Cannot change once products use it."
            errors={state.fieldErrors?.code}
          />
          <div className="grid gap-2">
            <Label htmlFor="unit-kind">Kind</Label>
            <NativeSelect id="unit-kind" name="kind" defaultValue="count" className="h-11 md:h-9">
              {KINDS.map(([k, label]) => (
                <NativeSelectOption key={k} value={k}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="unit-decimal" name="allowsDecimal" />
            <Label htmlFor="unit-decimal" className="font-normal">
              Allow decimals (e.g. 1.25 kg)
            </Label>
          </div>
          <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
            Add unit
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
