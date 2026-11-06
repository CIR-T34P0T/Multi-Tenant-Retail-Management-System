import "server-only";
import { createClient } from "@/lib/supabase/server";

export type RecordStatus = "active" | "archived";

export type SectionSummary = {
  id: string;
  name: string;
  description: string;
  status: RecordStatus;
  activeCategories: number;
  archivedCategories: number;
};

export type CategoryRow = {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  status: RecordStatus;
};

/**
 * All sections of a business with their category counts.
 * Row-Level Security already limits results to businesses the user may see;
 * the business filter keeps the query to the active business.
 */
export async function listSections(businessId: string): Promise<SectionSummary[]> {
  const supabase = await createClient();
  const [sections, categories] = await Promise.all([
    supabase.from("sections").select("id, name, description, status").eq("business_id", businessId),
    supabase.from("categories").select("section_id, status").eq("business_id", businessId),
  ]);
  if (sections.error) throw new Error(`Could not load sections: ${sections.error.message}`);
  if (categories.error) throw new Error(`Could not load categories: ${categories.error.message}`);

  return (sections.data ?? []).map((s) => {
    const own = (categories.data ?? []).filter((c) => c.section_id === s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status as RecordStatus,
      activeCategories: own.filter((c) => c.status === "active").length,
      archivedCategories: own.filter((c) => c.status === "archived").length,
    };
  });
}

/** One section, or null if it does not exist or belongs to a business the user can't see. */
export async function getSection(businessId: string, sectionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sections")
    .select("id, name, description, status, archived_at")
    .eq("business_id", businessId)
    .eq("id", sectionId)
    .maybeSingle();
  if (error) throw new Error(`Could not load section: ${error.message}`);
  return data ? { ...data, status: data.status as RecordStatus } : null;
}

export async function listCategories(
  businessId: string,
  sectionId: string,
): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, section_id, name, description, status")
    .eq("business_id", businessId)
    .eq("section_id", sectionId);
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    sectionId: c.section_id,
    name: c.name,
    description: c.description,
    status: c.status as RecordStatus,
  }));
}
