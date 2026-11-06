import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="dashboard"
      title="Dashboard"
      stage={8}
      description="Overview of stock across all sections, with a section filter."
    />
  );
}
