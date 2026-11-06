import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * PRIVILEGED client using the service-role key. It BYPASSES Row-Level Security.
 *
 * Only for narrowly scoped, audited server tasks (e.g. sending invitations,
 * platform administration). Never use it to serve normal user requests, and
 * never pass its results to the browser without filtering.
 * See docs/14-security-model.md §5.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
