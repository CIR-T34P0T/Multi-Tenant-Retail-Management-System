import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Mama Ade's Store", "mama-ades-store"],
    ["  Al-Barakah Provisions & Frozen Foods ", "al-barakah-provisions-frozen-foods"],
    ["Café Ìbàdàn", "cafe-ibadan"],
    ["A", "a-shop"],
    ["!!", "shop"],
  ])("%s → %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
    expect(isValidSlug(slugify(input))).toBe(true);
  });
  it("limits length to 48 and never ends with a hyphen", () => {
    const s = slugify("x".repeat(30) + " " + "y".repeat(30));
    expect(s.length).toBeLessThanOrEqual(48);
    expect(s.endsWith("-")).toBe(false);
    expect(isValidSlug(s)).toBe(true);
  });
});

describe("isValidSlug", () => {
  it.each(["ab", "-abc", "abc-", "ABC", "a b c", "a".repeat(49)])("rejects %s", (bad) => {
    expect(isValidSlug(bad)).toBe(false);
  });
});
