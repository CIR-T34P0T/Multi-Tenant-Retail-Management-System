import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Sections" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="catalog"
      title="Sections"
      stage={5}
      description="Departments of your business, such as Groceries, Frozen Food or Islamic Wear, and their categories."
    />
  );
}
