import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Suppliers" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Suppliers"
      stage={10}
      description="Supplier details and purchase history."
    />
  );
}
