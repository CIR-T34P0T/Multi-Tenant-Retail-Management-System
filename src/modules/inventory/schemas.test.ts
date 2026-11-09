import { describe, expect, it } from "vitest";
import {
  isIncrease,
  movementSchema,
  needsReason,
  parseMovementFilter,
  parseStockFilter,
  stockFilterHref,
} from "./schemas";

const ID = "6f1c1a52-0b8e-4c1e-9a77-1f2d3c4b5a69";

describe("stock list filters", () => {
  it("uses safe defaults for anything unexpected", () => {
    expect(parseStockFilter({ status: "everything", section: "x", page: "-3" })).toEqual({
      q: "",
      sectionId: null,
      categoryId: null,
      status: "all",
      archived: false,
      page: 1,
    });
  });
  it("reads valid values", () => {
    const f = parseStockFilter({
      q: "  rice   5kg ",
      section: ID,
      status: "low",
      archived: "1",
      page: "2",
    });
    expect(f).toMatchObject({
      q: "rice 5kg",
      sectionId: ID,
      status: "low",
      archived: true,
      page: 2,
    });
  });
  it("round-trips into a web address", () => {
    const f = parseStockFilter({ q: "malt", status: "out", page: "3" });
    expect(stockFilterHref(f)).toBe("/inventory?q=malt&status=out&page=3");
    expect(stockFilterHref(parseStockFilter({}))).toBe("/inventory");
  });
  it("reads the history filter", () => {
    expect(parseMovementFilter({ kind: "writeoff", page: "2" })).toEqual({
      kind: "writeoff",
      page: 2,
    });
    expect(parseMovementFilter({ kind: "sales" })).toEqual({ kind: "all", page: 1 });
  });
});

describe("kinds of stock change", () => {
  it("only additions skip the reason", () => {
    expect(needsReason("opening")).toBe(false);
    expect(needsReason("stock_in")).toBe(false);
    for (const t of ["stock_out", "damaged", "expired", "missing", "written_off"] as const) {
      expect(needsReason(t)).toBe(true);
      expect(isIncrease(t)).toBe(false);
    }
  });
  it("refuses unknown kinds (counts have their own screen)", () => {
    const base = { variantId: ID, unitId: ID, quantity: "1", reason: "", confirmNegative: false };
    expect(movementSchema.safeParse({ ...base, type: "count" }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, type: "damaged" }).success).toBe(true);
  });
});
