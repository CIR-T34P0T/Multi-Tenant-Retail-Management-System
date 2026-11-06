"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionResult } from "@/lib/action-result";
import { slugify } from "@/lib/slug";
import {
  MODULES,
  getModule,
  withRequirementsInOrder,
  type OptionalModuleCode,
} from "@/modules/registry";
import { createBusiness } from "../actions";
import { CURRENCIES, TIMEZONES } from "../options";

const OPTIONAL = MODULES.filter((m) => m.kind === "optional");

export function CreateBusinessForm() {
  const [state, action, pending] = useActionState(createBusiness, initialActionResult);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [modules, setModules] = useState<Set<OptionalModuleCode>>(new Set());

  const toggle = (code: OptionalModuleCode, on: boolean) => {
    const next = new Set(modules);
    if (on) {
      // Ticking a feature also ticks what it needs (e.g. Credit → Sales + Customers).
      withRequirementsInOrder([code]).forEach((c) => next.add(c));
    } else {
      next.delete(code);
      // Unticking a feature also unticks what depends on it.
      for (const m of OPTIONAL)
        if (m.requires.includes(code)) next.delete(m.code as OptionalModuleCode);
    }
    setModules(next);
  };

  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormAlert state={state} />
      <FormField
        label="Business name"
        name="name"
        required
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugEdited) setSlug(slugify(e.target.value));
        }}
        errors={state.fieldErrors?.name}
      />
      <FormField
        label="Business address (short name)"
        name="slug"
        required
        value={slug}
        onChange={(e) => {
          setSlugEdited(true);
          setSlug(e.target.value.toLowerCase());
        }}
        hint="Used to identify your business. Lowercase letters, numbers and hyphens."
        errors={state.fieldErrors?.slug}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <NativeSelect id="currency" name="currency" defaultValue="NGN" className="h-11 md:h-9">
            {CURRENCIES.map((c) => (
              <NativeSelectOption key={c.value} value={c.value}>
                {c.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-muted-foreground text-xs">Cannot be changed later.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timezone">Time zone</Label>
          <NativeSelect
            id="timezone"
            name="timezone"
            defaultValue="Africa/Lagos"
            className="h-11 md:h-9"
          >
            {TIMEZONES.map((t) => (
              <NativeSelectOption key={t.value} value={t.value}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Phone (optional)"
          name="phone"
          type="tel"
          autoComplete="tel"
          errors={state.fieldErrors?.phone}
        />
        <FormField
          label="Email (optional)"
          name="email"
          type="email"
          errors={state.fieldErrors?.email}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="address">Address (optional)</Label>
        <Textarea id="address" name="address" rows={2} />
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Which features do you need?</legend>
        <p className="text-muted-foreground -mt-2 text-xs">
          Stock management is always included. You can change these later in Settings.
        </p>
        {OPTIONAL.map((m) => {
          const code = m.code as OptionalModuleCode;
          const needs = m.requires.filter((r) => getModule(r).kind === "optional");
          return (
            <label
              key={m.code}
              className="hover:bg-accent/50 flex cursor-pointer gap-3 rounded-lg border p-3"
            >
              <Checkbox
                name="modules"
                value={m.code}
                checked={modules.has(code)}
                onCheckedChange={(v) => toggle(code, v === true)}
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{m.name}</span>
                <span className="text-muted-foreground text-xs">
                  {m.description}
                  {needs.length
                    ? ` Needs ${needs.map((n) => getModule(n).name).join(" and ")}.`
                    : ""}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <SubmitButton pending={pending}>Create business</SubmitButton>
    </form>
  );
}
