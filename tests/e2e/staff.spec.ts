import { expect, test } from "@playwright/test";
import {
  createBusiness,
  sidebar,
  signOut,
  signUp,
  uniqueEmail,
  topBar,
  visibleText,
} from "./helpers";

test("owner invites an attendant, who joins with limited permissions; suspension takes effect @mobile", async ({
  browser,
}) => {
  const ownerEmail = uniqueEmail("staff-owner");
  const attendantEmail = uniqueEmail("attendant");

  const owner = await (await browser.newContext()).newPage();
  await signUp(owner, "Musa Owner", ownerEmail);
  await createBusiness(owner, "Musa Islamic Wear", ["Sales"]);
  await owner.goto("/settings/staff");
  await owner.getByLabel("Their email address").fill(attendantEmail);
  await owner.getByRole("button", { name: "Save invitation" }).click();
  await expect(visibleText(owner, /Invitation saved/)).toBeVisible();
  await expect(owner.getByRole("list", { name: "Staff" })).toContainText(attendantEmail);
  await expect(owner.getByRole("list", { name: "Staff" })).toContainText("Invited");

  const staff = await (await browser.newContext()).newPage();
  await signUp(staff, "Zainab Attendant", attendantEmail);
  await expect(visibleText(staff, "Musa Islamic Wear")).toBeVisible();
  await staff.getByRole("button", { name: "Accept and join" }).click();
  await expect(staff).toHaveURL(/\/dashboard/);
  await expect(topBar(staff)).toContainText("Musa Islamic Wear");

  // Attendant: can open settings but cannot change them.
  await staff.goto("/settings");
  await expect(visibleText(staff, "Only the owner can change business details.")).toBeVisible();
  await expect(staff.getByRole("button", { name: "Save details" })).toHaveCount(0);
  await staff.goto("/settings/modules");
  await expect(staff.getByRole("switch", { name: "Sales" })).toBeDisabled();
  await staff.goto("/settings/staff");
  await expect(
    visibleText(staff, "You do not have permission to see the staff list."),
  ).toBeVisible();
  await staff.goto("/settings/roles");
  await expect(visibleText(staff, "Only the owner can change roles.")).toBeVisible();

  // Owner sees the attendant as active, then suspends them.
  await owner.reload();
  const row = owner.getByRole("listitem").filter({ hasText: attendantEmail });
  await expect(row).toContainText("Active");
  await row.getByRole("button", { name: "Suspend" }).click();
  await expect(visibleText(owner, "Access suspended immediately.")).toBeVisible();

  // The attendant loses access on their next page load.
  await staff.goto("/dashboard");
  await expect(staff).toHaveURL(/\/onboarding/);

  await signOut(owner);
});

test("owner adjusts the Attendant role's permissions", async ({ page }) => {
  await signUp(page, "Role Owner", uniqueEmail("roles"));
  await createBusiness(page, "Role Test Shop", ["Sales"]);
  await page.goto("/settings/roles");
  const attendant = page.locator("details").filter({ hasText: /^Attendant/ });
  await attendant.locator("summary").click();
  await attendant.getByRole("checkbox", { name: /View all sales/ }).check();
  await attendant.getByRole("button", { name: "Save Attendant permissions" }).click();
  await expect(visibleText(page, /Permissions saved/)).toBeVisible();
  await page.reload();
  await page
    .locator("details")
    .filter({ hasText: /^Attendant/ })
    .locator("summary")
    .click();
  await expect(
    page
      .locator("details")
      .filter({ hasText: /^Attendant/ })
      .getByRole("checkbox", { name: /View all sales/ }),
  ).toBeChecked();
  await expect(sidebar(page)).toBeVisible();
});
