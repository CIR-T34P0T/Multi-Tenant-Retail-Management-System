import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Sales" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="sales"
      title="Sales"
      stage={9}
      description="Point of sale, payments, receipts and sales history."
    />
  );
}
