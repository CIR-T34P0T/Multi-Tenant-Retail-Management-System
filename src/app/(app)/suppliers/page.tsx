import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Suppliers" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="suppliers"
      title="Suppliers"
      stage={10}
      description="Supplier details and purchase history."
    />
  );
}
