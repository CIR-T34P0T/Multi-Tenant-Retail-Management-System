import { expect, test } from "@playwright/test";
import { createBusiness, sidebar, signUp, uniqueEmail, topBar, visibleText } from "./helpers";

test.describe("Business settings, features and profile", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, "Bisi Owner", uniqueEmail("settings"));
    await createBusiness(page, "Bisi Frozen Foods", ["Credit"]);
  });

  test("owner edits business details; currency is fixed", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Business name").fill("Bisi Frozen Foods & Drinks");
    await page.getByLabel("Phone").fill("+234 801 234 5678");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(visibleText(page, "Business details saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Business name")).toHaveValue("Bisi Frozen Foods & Drinks");
    await expect(visibleText(page, "Nigerian naira (₦)")).toBeVisible();
    await expect(topBar(page)).toContainText("Bisi Frozen Foods & Drinks");
  });

  test("owner saves preferences", async ({ page }) => {
    await page.goto("/settings/preferences");
    await page.getByRole("switch", { name: /Allow selling more than recorded stock/ }).click();
    await page.getByLabel("Text at the bottom of receipts").fill("Thank you for shopping with us!");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(visibleText(page, "Settings saved.")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("switch", { name: /Allow selling more than recorded stock/ }),
    ).toBeChecked();
    await expect(page.getByLabel("Text at the bottom of receipts")).toHaveValue(
      "Thank you for shopping with us!",
    );
  });

  test("feature rules are enforced and switched-off pages are blocked", async ({ page }) => {
    await page.goto("/settings/modules");
    await page.getByRole("switch", { name: "Sales" }).click();
    await expect(visibleText(page, /Disable Credit first/)).toBeVisible();
    await expect(page.getByRole("switch", { name: "Sales" })).toBeChecked();

    await page.getByRole("switch", { name: "Credit" }).click();
    await expect(visibleText(page, /Credit switched off/)).toBeVisible();
    await page.getByRole("switch", { name: "Sales" }).click();
    await expect(visibleText(page, /Sales switched off/)).toBeVisible();

    await expect(sidebar(page).getByRole("link", { name: "Sales", exact: true })).toHaveCount(0);
    await page.goto("/sales");
    await expect(visibleText(page, "Sales is switched off")).toBeVisible();
  });

  test("profile name and password", async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("Your name").fill("Bisi Adebayo");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(visibleText(page, "Profile saved.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Bisi Adebayo");

    await page.getByLabel("Current password").fill("wrong-password-123");
    await page.getByLabel("New password", { exact: true }).fill("another-password-9");
    await page.getByLabel("Confirm new password").fill("another-password-9");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(visibleText(page, "Current password is incorrect")).toBeVisible();
  });
});
