import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Sections" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Sections"
      stage={5}
      description="Departments of your business, such as Groceries, Frozen Food or Islamic Wear, and their categories."
    />
  );
}
