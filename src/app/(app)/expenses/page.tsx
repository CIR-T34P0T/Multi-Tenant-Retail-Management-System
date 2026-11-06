import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="expenses"
      title="Expenses"
      stage={12}
      description="Business expenses by category, with receipts."
    />
  );
}
