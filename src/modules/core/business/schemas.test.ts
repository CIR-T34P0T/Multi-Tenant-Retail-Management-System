import { describe, expect, it } from "vitest";
import { createBusinessSchema, preferencesSchema } from "./schemas";

describe("business form validation", () => {
  const valid = {
    name: " Mama Ade Stores ",
    slug: "Mama-Ade",
    currency: "NGN",
    timezone: "Africa/Lagos",
    phone: "",
    email: "",
    address: "",
  };

  it("cleans and accepts a valid business", () => {
    const r = createBusinessSchema.parse(valid);
    expect(r).toMatchObject({
      name: "Mama Ade Stores",
      slug: "mama-ade",
      phone: null,
      email: null,
    });
  });

  it("rejects unknown currencies and time zones", () => {
    const r = createBusinessSchema.safeParse({ ...valid, currency: "XYZ", timezone: "Mars/Base" });
    expect(r.success).toBe(false);
  });

  it("rejects badly formed addresses", () => {
    expect(createBusinessSchema.safeParse({ ...valid, slug: "-bad-" }).success).toBe(false);
  });

  it("parses checkbox and money preferences without floats", () => {
    const r = preferencesSchema.parse({
      allowNegativeStock: "on",
      maxDiscountPercent: "12.5",
      cashRoundingIncrement: "50",
      receiptHeader: "",
      receiptFooter: "Thank you",
    });
    expect(r.allowNegativeStock).toBe(true);
    expect(r.returnsEnabled).toBe(false);
    expect(r.maxDiscountPercent).toBe("12.5");
  });

  it("caps discount at 100%", () => {
    const r = preferencesSchema.safeParse({
      maxDiscountPercent: "150",
      cashRoundingIncrement: "0",
      receiptHeader: "",
      receiptFooter: "",
    });
    expect(r.success).toBe(false);
  });
});
