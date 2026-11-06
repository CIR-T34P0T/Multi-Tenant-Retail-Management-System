import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Accounting" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Accounting"
      stage={12}
      description="Ledgers and financial summaries built from recorded transactions."
    />
  );
}
