import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Tags } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { setCategoryStatus, setSectionStatus } from "@/modules/catalog/sections/actions";
import { applyListFilter } from "@/modules/catalog/sections/filter";
import { getSection, listCategories, listSections } from "@/modules/catalog/sections/queries";
import { parseListFilter, recordIdSchema } from "@/modules/catalog/sections/schemas";
import { NewCategoryForm } from "@/modules/catalog/sections/components/category-forms";
import { ListFilterForm } from "@/modules/catalog/sections/components/list-filter";
import { CategoryList } from "@/modules/catalog/sections/components/lists";
import { SectionForm } from "@/modules/catalog/sections/components/section-form";
import { StatusButton } from "@/modules/catalog/sections/components/status-button";
import { getAppContext } from "@/modules/core/business/context";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Section" };

export default async function SectionPage({
  params,
  searchParams,
}: PageProps<"/sections/[sectionId]">) {
  const [ctx, { sectionId }, query] = await Promise.all([getAppContext(), params, searchParams]);
  // Unknown, malformed or another business's ID: same "not found" answer for all.
  if (!recordIdSchema.safeParse(sectionId).success) notFound();
  if (!ctx.can("catalog.section.manage") && !ctx.can("catalog.product.view")) notFound();

  const businessId = ctx.business.businessId;
  const [section, categories, sections] = await Promise.all([
    getSection(businessId, sectionId),
    listCategories(businessId, sectionId),
    listSections(businessId),
  ]);
  if (!section) notFound();

  const canManage = ctx.can("catalog.section.manage");
  const filter = parseListFilter(query);
  const shown = applyListFilter(categories, filter);
  const activeCount = categories.filter((c) => c.status === "active").length;
  const moveTargets = sections
    .filter((s) => s.status === "active" || s.id === section.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, name: s.name }));
  const basePath = `/sections/${section.id}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/sections"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> All sections
      </Link>
      <PageHeader
        title={section.name}
        description={section.description || undefined}
        actions={
          <>
            {section.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
            {canManage ? (
              <StatusButton
                name={section.name}
                status={section.status}
                explanation={`It and its ${activeCount} active ${activeCount === 1 ? "category" : "categories"} will no longer be offered when adding products.`}
                onChange={setSectionStatus.bind(null, section.id)}
              />
            ) : null}
          </>
        }
      />

      {section.status === "archived" ? (
        <ReadOnlyNote>
          This section is archived. Restore it to add categories or use it for products.
        </ReadOnlyNote>
      ) : null}

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionForm
            mode="edit"
            section={{ id: section.id, name: section.name, description: section.description }}
          />
          {section.status === "active" ? <NewCategoryForm sectionId={section.id} /> : null}
        </div>
      ) : (
        <ReadOnlyNote>You can view this section but not change it.</ReadOnlyNote>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-lg font-semibold">
          Categories
        </h2>
        {categories.length > 0 ? (
          <ListFilterForm
            filter={filter}
            basePath={basePath}
            searchLabel="Search categories"
            placeholder="Name or description"
          />
        ) : null}
        {shown.length > 0 ? (
          <CategoryList
            categories={shown}
            canManage={canManage}
            moveTargets={moveTargets}
            setStatus={setCategoryStatus}
          />
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Tags />
              </EmptyMedia>
              <EmptyTitle>
                {categories.length === 0 ? "No categories yet" : "No matching categories"}
              </EmptyTitle>
              <EmptyDescription>
                {categories.length === 0
                  ? "Categories group products inside this section, for example Rice or Noodles."
                  : "Try another search, or show archived categories."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
}
