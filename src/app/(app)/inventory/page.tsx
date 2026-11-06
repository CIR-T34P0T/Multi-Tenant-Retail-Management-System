import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="inventory"
      title="Inventory"
      stage={7}
      description="Current stock, manual additions and deductions, stock counts, write-offs and movement history."
    />
  );
}
