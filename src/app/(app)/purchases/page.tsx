import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Purchases" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Purchases"
      stage={10}
      description="Goods received from suppliers. Stock increases when a purchase is received."
    />
  );
}
