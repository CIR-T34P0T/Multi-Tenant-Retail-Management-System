import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-page";

export const metadata: Metadata = { title: "Products" };

export default function Page() {
  return (
    <ModulePlaceholder
      code="catalog"
      title="Products"
      stage={6}
      description="Products, variants such as size and colour, units, barcodes and prices."
    />
  );
}
