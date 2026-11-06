import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="customers"
      title="Customers"
      stage={11}
      description="Customer details and purchase history."
    />
  );
}
