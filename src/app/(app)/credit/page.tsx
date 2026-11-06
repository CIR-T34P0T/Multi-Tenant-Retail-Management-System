import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Credit" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Credit"
      stage={11}
      description="Sales on credit, outstanding balances and repayments."
    />
  );
}
