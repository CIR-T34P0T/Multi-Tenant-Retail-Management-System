import { Construction } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./page-header";

/**
 * Temporary page body for screens built in later stages.
 * Shows no fake data: it only says what will live here and when.
 */
export function StagePlaceholder({
  title,
  description,
  stage,
}: {
  title: string;
  description: string;
  stage: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Construction />
          </EmptyMedia>
          <EmptyTitle>Not built yet</EmptyTitle>
          <EmptyDescription>This screen is planned for a later development stage.</EmptyDescription>
        </EmptyHeader>
        <Badge variant="secondary">Stage {stage}</Badge>
      </Empty>
    </div>
  );
}
