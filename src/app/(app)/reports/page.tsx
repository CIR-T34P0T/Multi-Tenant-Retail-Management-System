import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="core"
      title="Reports"
      stage={13}
      description="Stock, sales, purchase and credit reports with export."
    />
  );
}
