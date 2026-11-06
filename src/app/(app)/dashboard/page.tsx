import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Dashboard"
      stage={8}
      description="Overview of stock across all sections, with a section filter."
    />
  );
}
