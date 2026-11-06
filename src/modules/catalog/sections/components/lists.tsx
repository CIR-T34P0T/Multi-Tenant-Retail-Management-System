import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ActionResult } from "@/lib/action-result";
import type { CategoryRow, SectionSummary } from "../queries";
import { EditCategoryDialog, type SectionOption } from "./category-forms";
import { StatusButton } from "./status-button";

export function SectionList({ sections }: { sections: SectionSummary[] }) {
  return (
    <ul className="divide-y rounded-lg border" aria-label="Sections">
      {sections.map((s) => (
        <li key={s.id}>
          <Link
            href={`/sections/${s.id}`}
            className="hover:bg-muted/50 flex items-center gap-3 p-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.name}</p>
              {s.description ? (
                <p className="text-muted-foreground truncate text-sm">{s.description}</p>
              ) : null}
            </div>
            <span className="text-muted-foreground shrink-0 text-sm">
              {s.activeCategories} {s.activeCategories === 1 ? "category" : "categories"}
            </span>
            {s.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CategoryList({
  categories,
  canManage,
  moveTargets,
  setStatus,
}: {
  categories: CategoryRow[];
  canManage: boolean;
  moveTargets: SectionOption[];
  setStatus: (id: string, next: "active" | "archived") => Promise<ActionResult>;
}) {
  return (
    <ul className="divide-y rounded-lg border" aria-label="Categories">
      {categories.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {c.name}{" "}
              {c.status === "archived" ? (
                <Badge variant="outline" className="ml-1 align-middle">
                  Archived
                </Badge>
              ) : null}
            </p>
            {c.description ? (
              <p className="text-muted-foreground text-sm">{c.description}</p>
            ) : null}
          </div>
          {canManage ? (
            <div className="flex gap-2">
              {c.status === "active" ? (
                <EditCategoryDialog category={c} sections={moveTargets} />
              ) : null}
              <StatusButton
                name={c.name}
                status={c.status}
                explanation="It will no longer be offered when adding products."
                onChange={setStatus.bind(null, c.id)}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
