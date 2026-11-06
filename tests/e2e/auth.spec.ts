import { expect, test } from "@playwright/test";
import {
  PASSWORD,
  createBusiness,
  latestEmailLink,
  sidebar,
  signIn,
  signOut,
  signUp,
  uniqueEmail,
  topBar,
  visibleText,
} from "./helpers";

test.describe("Registration, sign-in and sessions", () => {
  test("owner signs up, creates a business with features, signs out and back in @mobile", async ({
    page,
  }) => {
    const email = uniqueEmail("owner");
    await signUp(page, "Amina Bello", email);
    await createBusiness(page, "Amina Provisions", ["Credit"]);

    await expect(topBar(page)).toContainText("Amina Provisions");
    // Ticking Credit also switched on Sales and Customers (it needs them).
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768)
      await page.getByRole("button", { name: "Open or close menu" }).click();
    for (const item of ["Sales", "Customers", "Credit", "Inventory"]) {
      await expect(sidebar(page).getByRole("link", { name: item, exact: true })).toBeVisible();
    }
    await expect(sidebar(page).getByRole("link", { name: "Accounting" })).toHaveCount(0);
    if (viewport && viewport.width < 768) await page.keyboard.press("Escape");

    await signOut(page);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("sign-up form explains mistakes", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Test");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("different");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(visibleText(page, "Enter a valid email address")).toBeVisible();
    await expect(visibleText(page, "Use at least 10 characters")).toBeVisible();
    await expect(visibleText(page, "Passwords do not match")).toBeVisible();
  });

  test("wrong password gives a general message", async ({ page }) => {
    const email = uniqueEmail("wrongpw");
    await signUp(page, "Wrong Pw", email);
    await page.context().clearCookies();
    await signIn(page, email, "not-the-password-1");
    await expect(visibleText(page, "Email or password is incorrect.")).toBeVisible();
    await signIn(page, uniqueEmail("nobody"), "not-the-password-1");
    await expect(visibleText(page, "Email or password is incorrect.")).toBeVisible();
  });

  test("sign-in never redirects to another website", async ({ page }) => {
    const email = uniqueEmail("redirect");
    await signUp(page, "Redirect Test", email);
    await createBusiness(page, "Redirect Shop");
    await page.context().clearCookies();
    await page.goto("/sign-in?next=https://evil.example.com/steal");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/localhost:3000\/dashboard$|\/dashboard$/);
  });

  test("a tampered or expired session is treated as signed out", async ({ page, context }) => {
    const email = uniqueEmail("session");
    await signUp(page, "Session Test", email);
    await createBusiness(page, "Session Shop");
    const cookies = await context.cookies();
    const auth = cookies.filter((c) => c.name.includes("auth-token"));
    expect(auth.length).toBeGreaterThan(0);
    await context.clearCookies();
    await context.addCookies(auth.map((c) => ({ ...c, value: "base64-eyJ0YW1wZXJlZCI6dHJ1ZX0" })));
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("forgot password: same answer for unknown emails, and the reset link works", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(uniqueEmail("unknown"));
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(visibleText(page, /If an account exists for that email/)).toBeVisible();

    const email = uniqueEmail("reset");
    await signUp(page, "Reset Test", email);
    await createBusiness(page, "Reset Shop");
    await page.context().clearCookies();

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(visibleText(page, /If an account exists for that email/)).toBeVisible();

    await page.goto(await latestEmailLink(email));
    await expect(page).toHaveURL(/\/reset-password/);
    const newPassword = "brand-new-password-2";
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.context().clearCookies();
    await signIn(page, email, PASSWORD);
    await expect(visibleText(page, "Email or password is incorrect.")).toBeVisible();
    await signIn(page, email, newPassword);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
