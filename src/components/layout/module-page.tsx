import Link from "next/link";
import { PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getAppContext } from "@/modules/core/business/context";
import { getModule, type ModuleCode } from "@/modules/registry";
import { StagePlaceholder } from "./stage-placeholder";

/**
 * Server-side gate for a module's pages: if the module is switched off for this
 * business, the page is not shown even when its address is typed in directly.
 */
export async function ModuleGate({
  code,
  children,
}: {
  code: ModuleCode;
  children: React.ReactNode;
}) {
  const ctx = await getAppContext();
  if (ctx.moduleActive(code)) return children;
  const feature = getModule(code);
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PowerOff />
        </EmptyMedia>
        <EmptyTitle>{feature.name} is switched off</EmptyTitle>
        <EmptyDescription>
          This feature is not enabled for {ctx.business.name}.
          {ctx.can("core.module.manage")
            ? " You can switch it on in Settings."
            : " Ask the owner if you need it."}
        </EmptyDescription>
      </EmptyHeader>
      {ctx.can("core.module.manage") ? (
        <EmptyContent>
          <Button asChild>
            <Link href="/settings/modules">Open feature settings</Link>
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

/** Placeholder page for a module built in a later stage, respecting the module gate. */
export function ModulePlaceholder(props: {
  code: ModuleCode;
  title: string;
  stage: number;
  description: string;
}) {
  return (
    <ModuleGate code={props.code}>
      <StagePlaceholder title={props.title} stage={props.stage} description={props.description} />
    </ModuleGate>
  );
}
