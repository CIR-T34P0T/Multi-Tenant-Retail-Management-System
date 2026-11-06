import { describe, expect, it } from "vitest";
import { applyListFilter, matchesQuery, normalizeForSearch } from "./filter";
import { categorySchema, parseListFilter, sectionSchema } from "./schemas";

const items = [
  { name: "Groceries", description: "Rice, beans and provisions", status: "active" as const },
  { name: "Frozen Food", description: "Chicken, fish", status: "active" as const },
  { name: "Islamic Wear", description: "Jalab and hijab", status: "archived" as const },
  { name: "beverages", description: "", status: "active" as const },
];

describe("search", () => {
  it("normalises case, accents and spacing", () => {
    expect(normalizeForSearch("  Café   NOIR ")).toBe("cafe noir");
  });

  it("matches name or description, all words required", () => {
    expect(matchesQuery(items[0], "rice")).toBe(true);
    expect(matchesQuery(items[0], "GROC prov")).toBe(true);
    expect(matchesQuery(items[0], "rice fish")).toBe(false);
    expect(matchesQuery(items[0], "   ")).toBe(true);
  });

  it("filters by status and sorts by name ignoring capitals", () => {
    const active = applyListFilter(items, { q: "", status: "active" }).map((i) => i.name);
    expect(active).toEqual(["beverages", "Frozen Food", "Groceries"]);
    expect(applyListFilter(items, { q: "", status: "archived" }).map((i) => i.name)).toEqual([
      "Islamic Wear",
    ]);
    expect(applyListFilter(items, { q: "jalab", status: "all" })).toHaveLength(1);
    expect(applyListFilter(items, { q: "jalab", status: "active" })).toHaveLength(0);
  });
});

describe("address-bar filters", () => {
  it("defaults to active and empty search", () => {
    expect(parseListFilter({})).toEqual({ q: "", status: "active" });
  });
  it("accepts known statuses only", () => {
    expect(parseListFilter({ status: "archived" }).status).toBe("archived");
    expect(parseListFilter({ status: "deleted" }).status).toBe("active");
    expect(parseListFilter({ status: ["all", "x"] }).status).toBe("all");
  });
  it("trims and limits the search text", () => {
    expect(parseListFilter({ q: "  rice " }).q).toBe("rice");
    expect(parseListFilter({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("form validation", () => {
  it("requires a section name and limits lengths", () => {
    expect(sectionSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(sectionSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(
      sectionSchema.safeParse({ name: "Groceries", description: "y".repeat(301) }).success,
    ).toBe(false);
    expect(sectionSchema.parse({ name: " Groceries " })).toEqual({
      name: "Groceries",
      description: "",
    });
  });
  it("requires a valid section for a category", () => {
    expect(categorySchema.safeParse({ name: "Rice", sectionId: "not-an-id" }).success).toBe(false);
    expect(
      categorySchema.safeParse({ name: "Rice", sectionId: "7f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f" })
        .success,
    ).toBe(true);
  });
});
