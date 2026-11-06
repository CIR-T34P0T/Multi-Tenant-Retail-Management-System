import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Credit" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="credit"
      title="Credit"
      stage={11}
      description="Sales on credit, outstanding balances and repayments."
    />
  );
}
