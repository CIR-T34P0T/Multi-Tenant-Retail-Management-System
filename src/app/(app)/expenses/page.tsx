import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Expenses"
      stage={12}
      description="Business expenses by category, with receipts."
    />
  );
}
