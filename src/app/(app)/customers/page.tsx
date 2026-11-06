import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Customers"
      stage={11}
      description="Customer details and purchase history."
    />
  );
}
