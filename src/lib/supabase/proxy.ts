import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";

/**
 * Refreshes the Supabase auth session on every matched request and writes
 * updated cookies to the response. Route protection (redirect to sign-in)
 * is added in Stage 4.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Allow the app shell to run before Supabase is configured (Stage 2).
  if (!isSupabaseConfigured()) return response;

  const env = getPublicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Do not run other code between creating the client and this call:
  // getClaims() validates the JWT and triggers a refresh when needed.
  await supabase.auth.getClaims();

  return response;
}
