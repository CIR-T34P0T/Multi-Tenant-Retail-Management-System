import type { NextRequest } from "next/server";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

/** Pages for signed-out visitors; signed-in users are sent to the dashboard instead. */
const GUEST_ONLY = ["/sign-in", "/sign-up", "/forgot-password"];
/** Pages anyone may open. */
const PUBLIC = [...GUEST_ONLY, "/auth/confirm"];

const matches = (pathname: string, list: string[]) =>
  list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Runs before every page (Next.js 16 "proxy", formerly middleware):
 * refreshes the session and keeps signed-out visitors away from the app.
 * This is a convenience redirect — pages and the database check again.
 */
export async function proxy(request: NextRequest) {
  const { response, userId, configured } = await updateSession(request);
  if (!configured) return response;

  const { pathname, search } = request.nextUrl;

  if (!userId && !matches(pathname, PUBLIC)) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return redirectWithCookies(request, response, `/sign-in?next=${next}`);
  }
  if (userId && matches(pathname, GUEST_ONLY)) {
    return redirectWithCookies(request, response, "/dashboard");
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images and PWA files.
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
