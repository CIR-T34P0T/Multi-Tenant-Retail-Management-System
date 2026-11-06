import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Settings"
      stage={4}
      description="Business details, staff accounts, permissions and modules."
    />
  );
}
