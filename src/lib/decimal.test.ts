import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatQuantity,
  fromBaseQuantity,
  isWholeQuantity,
  lineTotal,
  moneyString,
  roundMoney,
  sumMoney,
  toBaseQuantity,
  toDecimal,
} from "./decimal";

describe("toDecimal", () => {
  it("parses numeric strings exactly", () => {
    expect(toDecimal("12500.50").toFixed(2)).toBe("12500.50");
    expect(toDecimal(" -3.25 ").toString()).toBe("-3.25");
  });

  it("rejects text, NaN and Infinity", () => {
    expect(() => toDecimal("12,500")).toThrow(RangeError);
    expect(() => toDecimal("abc")).toThrow(RangeError);
    expect(() => toDecimal("")).toThrow(RangeError);
    expect(() => toDecimal(Number.NaN)).toThrow(RangeError);
    expect(() => toDecimal(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("money", () => {
  it("adds without floating-point drift", () => {
    expect(sumMoney(["0.1", "0.2"]).toFixed(2)).toBe("0.30");
    expect(sumMoney(Array(1000).fill("0.10")).toFixed(2)).toBe("100.00");
  });

  it("rounds half-up to kobo where floats round down", () => {
    // In plain JS, (2.675).toFixed(2) === "2.67".
    expect(roundMoney("2.675").toFixed(2)).toBe("2.68");
    expect(moneyString("1.005")).toBe("1.01");
  });

  it("computes line totals", () => {
    expect(lineTotal("3", "1499.99").toFixed(2)).toBe("4499.97");
    expect(lineTotal("1.25", "3200").toFixed(2)).toBe("4000.00");
  });

  it("formats Naira for display", () => {
    expect(formatMoney("12500")).toBe("₦12,500.00");
    expect(formatMoney("0.5")).toBe("₦0.50");
  });
});

describe("unit conversion", () => {
  it("converts cartons to pieces", () => {
    expect(toBaseQuantity("3", "24").toString()).toBe("72");
  });

  it("converts pieces back to cartons", () => {
    expect(fromBaseQuantity("30", "24").toString()).toBe("1.25");
  });

  it("keeps 4 decimal places for fractional units", () => {
    expect(toBaseQuantity("1.2345678", "1").toString()).toBe("1.2346");
  });

  it("rejects zero or negative factors", () => {
    expect(() => toBaseQuantity("1", "0")).toThrow(RangeError);
    expect(() => fromBaseQuantity("1", "-2")).toThrow(RangeError);
  });

  it("detects whole quantities", () => {
    expect(isWholeQuantity("72")).toBe(true);
    expect(isWholeQuantity("1.25")).toBe(false);
  });

  it("formats quantities with units", () => {
    expect(formatQuantity("72.0000", "pc")).toBe("72 pc");
    expect(formatQuantity("1.25", "ctn")).toBe("1.25 ctn");
  });
});
