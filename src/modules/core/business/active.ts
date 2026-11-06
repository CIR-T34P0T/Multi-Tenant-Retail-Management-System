/** Pure logic for choosing which business is active. Unit-tested. */
export type MembershipSummary = {
  businessId: string;
  name: string;
  slug: string;
};

export const ACTIVE_BUSINESS_COOKIE = "rbms_active_business";

/**
 * The cookie only remembers a preference. It never grants access: if it names a
 * business the user is not (or no longer) a member of, it is ignored.
 */
export function chooseActiveBusiness(
  memberships: readonly MembershipSummary[],
  cookieValue: string | undefined,
): MembershipSummary | null {
  if (memberships.length === 0) return null;
  const preferred = cookieValue ? memberships.find((m) => m.businessId === cookieValue) : undefined;
  return preferred ?? [...memberships].sort((a, b) => a.name.localeCompare(b.name))[0];
}
