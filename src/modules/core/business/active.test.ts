import { describe, expect, it } from "vitest";
import { chooseActiveBusiness } from "./active";

const a = { businessId: "a", name: "Zulu Mart", slug: "zulu" };
const b = { businessId: "b", name: "Alpha Store", slug: "alpha" };

describe("chooseActiveBusiness", () => {
  it("returns null when the user has no business", () => {
    expect(chooseActiveBusiness([], "a")).toBeNull();
  });
  it("uses the remembered business when the user is a member", () => {
    expect(chooseActiveBusiness([a, b], "a")).toBe(a);
  });
  it("ignores a cookie naming a business the user does not belong to", () => {
    expect(chooseActiveBusiness([a, b], "someone-elses-business")).toBe(b);
  });
  it("falls back to the first business alphabetically", () => {
    expect(chooseActiveBusiness([a, b], undefined)).toBe(b);
  });
});
