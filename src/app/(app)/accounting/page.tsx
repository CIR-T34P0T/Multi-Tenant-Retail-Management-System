import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Accounting" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="accounting"
      title="Accounting"
      stage={12}
      description="Ledgers and financial summaries built from recorded transactions."
    />
  );
}
