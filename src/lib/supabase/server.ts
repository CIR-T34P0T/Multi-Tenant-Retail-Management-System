import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user (session from cookies), so Row-Level Security
 * applies exactly as it would in the browser.
 *
 * Create a new client per request; never share one between users.
 * Reading cookies makes the caller dynamic, so render it inside <Suspense>.
 */
export async function createClient() {
  // Read cookies first: this marks the page as personal (rendered per request),
  // so Next.js never tries to pre-build it.
  const cookieStore = await cookies();
  // Business data must always be fresh and the auth library checks the clock,
  // so database access only happens while serving a real request.
  await connection();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: the proxy refreshes the session on each request.
          }
        },
      },
    },
  );
}
