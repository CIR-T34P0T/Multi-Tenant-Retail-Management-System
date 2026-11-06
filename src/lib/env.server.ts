import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Importing this file from a client component fails the
 * build (because of `server-only`), which keeps the service-role key out of
 * the browser.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  });
  if (!parsed.success) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. It is only needed for privileged " +
        "server tasks; set it in .env.local (never in a NEXT_PUBLIC_ variable).",
    );
  }
  return parsed.data;
}
