import type { Metadata } from "next";
import { getAppContext } from "@/modules/core/business/context";
import { ModulesList } from "@/modules/core/settings/components/modules-list";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Features" };

export default async function ModulesPage() {
  const ctx = await getAppContext();
  const canManage = ctx.can("core.module.manage");
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Switch features on or off for {ctx.business.name}. Switching a feature off hides it and
        keeps all its records; switching it back on brings them back.
      </p>
      {canManage ? null : (
        <ReadOnlyNote>Only the owner can switch features on or off.</ReadOnlyNote>
      )}
      <ModulesList enabled={[...ctx.enabledModules]} canManage={canManage} />
    </div>
  );
}
