import { describe, expect, it } from "vitest";
import {
  SKU_PATTERN,
  combineOptions,
  parseOptionValues,
  suggestSku,
  uniqueSku,
  variantKey,
  variantLabel,
} from "./variants";

describe("option values", () => {
  it("splits, tidies and removes duplicates ignoring capitals", () => {
    expect(parseOptionValues(" S, M,  L , m,, ")).toEqual(["S", "M", "L"]);
    expect(parseOptionValues("Navy   Blue, White")).toEqual(["Navy Blue", "White"]);
    expect(parseOptionValues("")).toEqual([]);
  });

  it("combines options into every variant", () => {
    const combos = combineOptions([
      { name: "Size", values: ["M", "L"] },
      { name: "Colour", values: ["White", "Black"] },
    ]);
    expect(combos).toEqual([
      ["M", "White"],
      ["M", "Black"],
      ["L", "White"],
      ["L", "Black"],
    ]);
  });

  it("gives one standard variant when there are no options", () => {
    expect(combineOptions([])).toEqual([[]]);
    expect(combineOptions([{ name: "Size", values: [] }])).toEqual([[]]);
    expect(variantLabel([])).toBe("Standard");
    expect(variantLabel(["L", "White"])).toBe("L / White");
  });

  it("keys combinations ignoring capitals", () => {
    expect(variantKey(["L", "White"])).toBe(variantKey(["l", "WHITE"]));
    expect(variantKey(["L", "White"])).not.toBe(variantKey(["White", "L"]));
  });
});

describe("product codes (SKU)", () => {
  it("suggests a readable code", () => {
    expect(suggestSku("Men's Jalab", ["M", "White"])).toBe("MENS-JALA-M-WHI");
    expect(suggestSku("Malt 33cl", [])).toBe("MALT-33CL");
    expect(suggestSku("Café Noir Premium Extra", [])).toBe("CAFE-NOIR-PREM");
    expect(suggestSku("!!!", [])).toBe("ITEM");
  });

  it("always fits the database rule", () => {
    const long = suggestSku("Extraordinarily Long Product Name Here", [
      "Extra Large",
      "Royal Blue",
      "Cotton",
    ]);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(SKU_PATTERN.test(long)).toBe(true);
  });

  it("avoids codes already taken", () => {
    const taken = new Set(["MALT-33CL", "MALT-33CL-2"]);
    expect(uniqueSku("MALT-33CL", taken)).toBe("MALT-33CL-3");
    expect(uniqueSku("malt-33cl", taken)).toBe("malt-33cl-3");
    expect(uniqueSku("NEW", taken)).toBe("NEW");
    expect(uniqueSku("X".repeat(40), new Set(["X".repeat(40)]))).toHaveLength(40);
  });
});
