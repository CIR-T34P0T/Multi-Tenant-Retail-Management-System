import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Inventory"
      stage={7}
      description="Current stock, manual additions and deductions, stock counts, write-offs and movement history."
    />
  );
}
