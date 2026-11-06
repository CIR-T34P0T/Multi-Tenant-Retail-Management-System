/** Standard result returned by Server Actions to forms. */
export type ActionResult = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialActionResult: ActionResult = { ok: false };

type DbError = { code?: string; message?: string } | null | undefined;

/**
 * Converts a database error into a message safe to show staff.
 * Our own database functions raise plain-language messages; anything else
 * becomes a generic message so internal details are never shown.
 */
export function dbErrorMessage(
  error: DbError,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!error) return fallback;
  const ownMessage =
    error.message &&
    !/permission denied|violates|row-level security|relation|column|syntax/i.test(error.message);
  switch (error.code) {
    case "42501":
      return ownMessage ? error.message! : "You do not have permission to do this.";
    case "23505":
    case "22023":
    case "23514":
      return ownMessage ? error.message! : fallback;
    default:
      return fallback;
  }
}
