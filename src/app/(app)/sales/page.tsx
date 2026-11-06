import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Sales" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Sales"
      stage={9}
      description="Point of sale, payments, receipts and sales history."
    />
  );
}
