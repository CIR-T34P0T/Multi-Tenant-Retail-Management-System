"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MODULES, getModule, type OptionalModuleCode } from "@/modules/registry";
import { setModuleEnabled } from "../../business/actions";

const OPTIONAL = MODULES.filter((m) => m.kind === "optional");

export function ModulesList({
  enabled,
  canManage,
}: {
  enabled: OptionalModuleCode[];
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const on = new Set(enabled);

  const change = (code: OptionalModuleCode, value: boolean) => {
    setBusy(code);
    start(async () => {
      const r = await setModuleEnabled(code, value);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      setBusy(null);
    });
  };

  return (
    <ul className="grid gap-3">
      <li className="bg-muted/50 rounded-lg border p-3 text-sm">
        <span className="font-medium">Always on:</span> Sections &amp; products, Pricing, Inventory,
        Dashboard, Reports, Settings.
      </li>
      {OPTIONAL.map((m) => {
        const code = m.code as OptionalModuleCode;
        const needs = m.requires
          .filter((r) => getModule(r).kind === "optional")
          .map((r) => getModule(r).name);
        return (
          <li key={m.code} className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="grid gap-1">
              <Label htmlFor={`module-${m.code}`} className="flex items-center gap-2">
                {m.name}
                {on.has(code) ? <Badge variant="secondary">On</Badge> : null}
              </Label>
              <p className="text-muted-foreground text-xs">
                {m.description}
                {needs.length ? ` Needs ${needs.join(" and ")}.` : ""}
              </p>
            </div>
            <Switch
              id={`module-${m.code}`}
              checked={on.has(code)}
              disabled={!canManage || pending}
              aria-busy={busy === code}
              onCheckedChange={(v) => change(code, v)}
            />
          </li>
        );
      })}
    </ul>
  );
}
