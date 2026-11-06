import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("keeps internal paths, query and hash", () => {
    expect(safeNextPath("/settings/staff?tab=1#top")).toBe("/settings/staff?tab=1#top");
  });
  it.each([
    "https://evil.com",
    "//evil.com/path",
    "/\\evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    "/ok\nSet-Cookie: x=1",
    undefined,
    null,
    42,
  ])("rejects %s", (bad) => {
    expect(safeNextPath(bad)).toBe("/dashboard");
  });
  it("uses the given fallback", () => {
    expect(safeNextPath("https://x.y", "/onboarding")).toBe("/onboarding");
  });
});
