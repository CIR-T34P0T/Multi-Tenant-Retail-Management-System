import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/modules/core/business/context";
import {
  PreferencesForm,
  type Preferences,
} from "@/modules/core/settings/components/preferences-form";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const ctx = await getAppContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_settings")
    // numeric columns are read as text so values stay exact (lib/supabase/decimal-column.ts)
    .select(
      "allow_negative_stock, low_stock_alerts_enabled, require_customer_on_sale, returns_enabled, max_discount_percent::text, cash_rounding_increment::text, receipt_header, receipt_footer",
    )
    .eq("business_id", ctx.business.businessId)
    .single();
  if (error) throw new Error(error.message);
  const readOnly = !ctx.can("core.settings.manage");
  const prefs: Preferences = data;
  return (
    <div className="grid gap-4">
      {readOnly ? (
        <ReadOnlyNote>You can view these settings but not change them.</ReadOnlyNote>
      ) : null}
      <PreferencesForm prefs={prefs} readOnly={readOnly} salesActive={ctx.moduleActive("sales")} />
    </div>
  );
}
