import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Purchases" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="purchases"
      title="Purchases"
      stage={10}
      description="Goods received from suppliers. Stock increases when a purchase is received."
    />
  );
}
