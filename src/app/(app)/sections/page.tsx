import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { applyListFilter } from "@/modules/catalog/sections/filter";
import { listSections } from "@/modules/catalog/sections/queries";
import { parseListFilter } from "@/modules/catalog/sections/schemas";
import { ListFilterForm } from "@/modules/catalog/sections/components/list-filter";
import { SectionList } from "@/modules/catalog/sections/components/lists";
import { SectionForm } from "@/modules/catalog/sections/components/section-form";
import { SectionSuggestions } from "@/modules/catalog/sections/components/section-suggestions";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Sections" };

export default async function SectionsPage({ searchParams }: PageProps<"/sections">) {
  const [ctx, params] = await Promise.all([getAppContext(), searchParams]);
  const canManage = ctx.can("catalog.section.manage");
  const header = (
    <PageHeader
      title="Sections"
      description="Departments of your business, such as Groceries or Frozen Food. Each section has its own categories."
    />
  );
  if (!canManage && !ctx.can("catalog.product.view")) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ReadOnlyNote>You do not have permission to see sections.</ReadOnlyNote>
      </div>
    );
  }

  const filter = parseListFilter(params);
  const all = await listSections(ctx.business.businessId);
  const shown = applyListFilter(all, filter);

  return (
    <div className="flex flex-col gap-6">
      {header}
      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionForm mode="create" />
          <SectionSuggestions existing={all.map((s) => s.name)} />
        </div>
      ) : (
        <ReadOnlyNote>You can view sections but not change them.</ReadOnlyNote>
      )}

      {all.length > 0 ? (
        <ListFilterForm
          filter={filter}
          basePath="/sections"
          searchLabel="Search sections"
          placeholder="Name or description"
        />
      ) : null}

      {shown.length > 0 ? (
        <SectionList sections={shown} />
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>{all.length === 0 ? "No sections yet" : "No matching sections"}</EmptyTitle>
            <EmptyDescription>
              {all.length === 0
                ? canManage
                  ? "Add your first section above, or use a quick-start suggestion."
                  : "The owner has not set up any sections yet."
                : "Try another search, or show archived sections."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
