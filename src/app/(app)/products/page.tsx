import type { Metadata } from "next";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export const metadata: Metadata = { title: "Products" };

export default function Page() {
  return (
    <StagePlaceholder
      title="Products"
      stage={6}
      description="Products, variants such as size and colour, units, barcodes and prices."
    />
  );
}
