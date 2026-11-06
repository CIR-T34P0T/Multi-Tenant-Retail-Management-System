import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Reports"
      stage={13}
      description="Stock, sales, purchase and credit reports with export."
    />
  );
}
