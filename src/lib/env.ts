import { z } from "zod";

/**
 * Environment variables, validated with Zod.
 *
 * - `NEXT_PUBLIC_*` values are embedded into the browser bundle at build time.
 *   They must never contain secrets.
 * - Server-only values (like the service-role key) live in `env.server.ts`,
 *   which cannot be imported from client components.
 *
 * Validation is lazy (on first use) so the app can be built before a
 * Supabase instance exists; using Supabase without configuration fails
 * with a clear message instead.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | null = null;

/** Raw values must be referenced literally so Next.js can inline them. */
function readPublic() {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  };
}

/** True when the Supabase connection settings are present and valid. */
export function isSupabaseConfigured(): boolean {
  return publicSchema.safeParse(readPublic()).success;
}

/** Returns validated public env, or throws a readable configuration error. */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse(readPublic());
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${fields}. ` +
        "Copy .env.example to .env.local and fill in the values (see README).",
    );
  }
  cached = parsed.data;
  return cached;
}
