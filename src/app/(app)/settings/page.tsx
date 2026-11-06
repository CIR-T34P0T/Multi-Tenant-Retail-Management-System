import type { Metadata } from "next";
import { FormAlert } from "@/components/forms/form-alert";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/modules/core/business/context";
import {
  BusinessDetailsForm,
  type BusinessDetails,
} from "@/modules/core/settings/components/business-details-form";
import { ReadOnlyNote } from "@/modules/core/settings/components/read-only-note";

export const metadata: Metadata = { title: "Business settings" };

export default async function BusinessSettingsPage({ searchParams }: PageProps<"/settings">) {
  const [ctx, params] = await Promise.all([getAppContext(), searchParams]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("name, slug, legal_name, phone, email, address, currency_code, timezone")
    .eq("id", ctx.business.businessId)
    .single();
  if (error) throw new Error(error.message);
  const readOnly = !ctx.can("core.business.update");

  return (
    <div className="grid gap-4">
      {params.notice === "setup-incomplete" ? (
        <FormAlert
          state={{
            ok: false,
            message:
              "Your business was created, but some details or features could not be saved. Please check them below and under Features.",
          }}
        />
      ) : null}
      {readOnly ? <ReadOnlyNote>Only the owner can change business details.</ReadOnlyNote> : null}
      <BusinessDetailsForm business={data as BusinessDetails} readOnly={readOnly} />
    </div>
  );
}
