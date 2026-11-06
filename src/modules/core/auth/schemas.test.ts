import { describe, expect, it } from "vitest";
import { fieldErrors, signInSchema, signUpSchema } from "./schemas";

describe("auth form validation", () => {
  it("normalises email to lowercase without spaces", () => {
    const r = signInSchema.parse({ email: "  Ann@Shop.NG ", password: "x" });
    expect(r.email).toBe("ann@shop.ng");
  });

  it("requires a 10+ character password and matching confirmation", () => {
    const r = signUpSchema.safeParse({
      fullName: "Ann Ade",
      email: "ann@shop.ng",
      password: "short",
      confirmPassword: "different",
    });
    expect(r.success).toBe(false);
    const errors = fieldErrors(r.error!);
    expect(errors.password?.[0]).toMatch(/10 characters/);
    expect(errors.confirmPassword?.[0]).toMatch(/do not match/);
  });

  it("rejects an invalid email", () => {
    const r = signInSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!).email?.[0]).toMatch(/valid email/);
  });

  it("accepts a valid sign-up", () => {
    expect(
      signUpSchema.safeParse({
        fullName: "Ann Ade",
        email: "ann@shop.ng",
        password: "correct-horse-1",
        confirmPassword: "correct-horse-1",
      }).success,
    ).toBe(true);
  });
});
