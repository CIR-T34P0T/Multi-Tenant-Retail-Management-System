import { expect, test, type Page } from "@playwright/test";
import { createBusiness, signUp, uniqueEmail, visibleText } from "./helpers";

/** The list of sections or categories on the current page. */
const list = (page: Page, name: "Sections" | "Categories") =>
  page.getByRole("list", { name }).filter({ visible: true });

/**
 * Adds a section and, unless an error is expected, waits until it is saved
 * (the form clears itself after saving, so typing earlier would be lost).
 */
async function addSection(page: Page, name: string, description = "", expectSaved = true) {
  await page.getByLabel("Section name").fill(name);
  if (description) await page.getByLabel(/Description/).fill(description);
  await page.getByRole("button", { name: "Add section" }).click();
  if (expectSaved) await expect(visibleText(page, /^Section ".*" created\.$/).last()).toBeVisible();
}

async function addCategory(page: Page, name: string, expectSaved = true) {
  await page.getByLabel("Category name").fill(name);
  await page.getByRole("button", { name: "Add category" }).click();
  if (expectSaved) await expect(visibleText(page, `Category "${name}" added.`)).toBeVisible();
}

/** Uses visible elements only: Next.js keeps the previous page hidden in the background. */
async function search(page: Page, label: string, text: string, show = "Active") {
  const form = page.getByRole("search").filter({ visible: true });
  await form.getByLabel(label).fill(text);
  await form.getByLabel("Show").selectOption({ label: show });
  await form.getByRole("button", { name: "Search" }).click();
}

test("owner builds sections and categories, with search and validation @mobile", async ({
  page,
}) => {
  await signUp(page, "Amina Owner", uniqueEmail("sections"));
  await createBusiness(page, "Amina Mixed Store");
  await page.goto("/sections");
  await expect(visibleText(page, "No sections yet")).toBeVisible();

  // Quick-start suggestion, then a custom section with messy spacing.
  await page.getByRole("button", { name: "Groceries" }).click();
  await expect(list(page, "Sections")).toContainText("Groceries");
  // Remaining suggestions stay available (folded) after the first section exists.
  await page.getByText("Quick start: common sections").filter({ visible: true }).click();
  await page.getByRole("button", { name: "Beverages" }).filter({ visible: true }).click();
  await expect(list(page, "Sections")).toContainText("Beverages");
  await expect(
    page.getByRole("button", { name: "Groceries" }).filter({ visible: true }),
  ).toHaveCount(0);
  await addSection(page, "  Frozen    Food ", "Chicken, fish and ice cream");
  await expect(visibleText(page, 'Section "Frozen Food" created.')).toBeVisible();
  await expect(list(page, "Sections")).toContainText("Frozen Food");

  // Duplicate names are refused, ignoring capitals.
  await addSection(page, "GROCERIES", "", false);
  await expect(visibleText(page, "A section with this name already exists")).toBeVisible();

  // Search by description.
  await search(page, "Search sections", "fish");
  await expect(list(page, "Sections")).toContainText("Frozen Food");
  await expect(list(page, "Sections")).not.toContainText("Groceries");
  await page.getByRole("link", { name: "Clear" }).click();

  // Categories inside Groceries.
  await list(page, "Sections")
    .getByRole("link", { name: /Groceries/ })
    .click();
  await expect(page.getByRole("heading", { name: "Groceries", level: 1 })).toBeVisible();
  await addCategory(page, "Rice");
  await expect(list(page, "Categories")).toContainText("Rice");
  await addCategory(page, "Noodles");
  await addCategory(page, "rice", false);
  await expect(
    visibleText(page, "This section already has a category with this name"),
  ).toBeVisible();

  // Edit: rename and move a category to another section.
  await list(page, "Categories").getByRole("button", { name: "Edit Noodles" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit category" });
  await dialog.getByLabel("Category name").fill("Ice Cream");
  await dialog.getByLabel("Section").selectOption({ label: "Frozen Food" });
  await dialog.getByRole("button", { name: "Save category" }).click();
  await expect(dialog).toBeHidden();
  await expect(list(page, "Categories")).not.toContainText("Noodles");
  await page.goto("/sections");
  await list(page, "Sections")
    .getByRole("link", { name: /Frozen Food/ })
    .click();
  await expect(list(page, "Categories")).toContainText("Ice Cream");

  // Search categories.
  await addCategory(page, "Chicken");
  await search(page, "Search categories", "chick");
  await expect(list(page, "Categories")).toContainText("Chicken");
  await expect(list(page, "Categories")).not.toContainText("Ice Cream");
});

test("archiving and restoring sections and categories never loses data", async ({ page }) => {
  await signUp(page, "Bala Owner", uniqueEmail("archive"));
  await createBusiness(page, "Bala Provisions");
  await page.goto("/sections");
  await addSection(page, "Beverages");
  await list(page, "Sections")
    .getByRole("link", { name: /Beverages/ })
    .click();
  await addCategory(page, "Soft drinks");
  await addCategory(page, "Water");

  // Archive a category (with confirmation); it moves to the archived view.
  await list(page, "Categories").getByRole("button", { name: "Archive Water" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(visibleText(page, '"Water" archived.')).toBeVisible();
  await expect(list(page, "Categories")).not.toContainText("Water");
  await search(page, "Search categories", "", "Archived");
  await expect(list(page, "Categories")).toContainText("Water");
  await list(page, "Categories").getByRole("button", { name: "Restore Water" }).click();
  await expect(visibleText(page, '"Water" restored.')).toBeVisible();

  // Archive the whole section: no new categories until restored.
  await page.getByRole("button", { name: "Archive Beverages" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("2 active categories");
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(visibleText(page, /This section is archived/)).toBeVisible();
  await expect(page.getByLabel("Category name")).toHaveCount(0);

  await page.goto("/sections");
  await expect(visibleText(page, "No matching sections")).toBeVisible();
  await search(page, "Search sections", "", "Archived");
  await expect(list(page, "Sections")).toContainText("Beverages");
  await list(page, "Sections")
    .getByRole("link", { name: /Beverages/ })
    .click();
  await page.getByRole("button", { name: "Restore Beverages" }).click();
  await expect(visibleText(page, '"Beverages" restored.')).toBeVisible();
  await search(page, "Search categories", "", "All");
  await expect(list(page, "Categories")).toContainText("Soft drinks");
  await expect(list(page, "Categories")).toContainText("Water");
});

test("an attendant can view sections but not change them @mobile", async ({ browser }) => {
  const ownerEmail = uniqueEmail("sec-owner");
  const attendantEmail = uniqueEmail("sec-staff");
  const owner = await (await browser.newContext()).newPage();
  await signUp(owner, "Chika Owner", ownerEmail);
  await createBusiness(owner, "Chika Fashion");
  await owner.goto("/sections");
  await addSection(owner, "Islamic Wear");
  await list(owner, "Sections")
    .getByRole("link", { name: /Islamic Wear/ })
    .click();
  await addCategory(owner, "Jalab");
  await owner.goto("/settings/staff");
  await owner.getByLabel("Their email address").fill(attendantEmail);
  await owner.getByRole("button", { name: "Save invitation" }).click();
  await expect(visibleText(owner, /Invitation saved/)).toBeVisible();

  const staff = await (await browser.newContext()).newPage();
  await signUp(staff, "Dayo Attendant", attendantEmail);
  await staff.getByRole("button", { name: "Accept and join" }).click();
  await expect(staff).toHaveURL(/\/dashboard/);

  await staff.goto("/sections");
  await expect(visibleText(staff, "You can view sections but not change them.")).toBeVisible();
  await expect(staff.getByLabel("Section name")).toHaveCount(0);
  await list(staff, "Sections")
    .getByRole("link", { name: /Islamic Wear/ })
    .click();
  await expect(list(staff, "Categories")).toContainText("Jalab");
  await expect(staff.getByRole("button", { name: /Archive|Edit/ })).toHaveCount(0);
  await expect(staff.getByLabel("Category name")).toHaveCount(0);
});

test("another business cannot open a section by its address", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signUp(a, "Owner Alpha", uniqueEmail("sec-a"));
  await createBusiness(a, "Alpha Groceries");
  await a.goto("/sections");
  await addSection(a, "Secret Section");
  await list(a, "Sections")
    .getByRole("link", { name: /Secret Section/ })
    .click();
  await expect(a).toHaveURL(/\/sections\/[0-9a-f-]{36}$/);
  const address = new URL(a.url()).pathname;

  const b = await (await browser.newContext()).newPage();
  await signUp(b, "Owner Beta", uniqueEmail("sec-b"));
  await createBusiness(b, "Beta Groceries");
  // The page streams (loading screen first), so the "not found" answer is
  // shown in the page rather than as an HTTP 404 code. No data is sent either way.
  await b.goto(address);
  await expect(visibleText(b, "Page not found")).toBeVisible();
  expect(await b.content()).not.toContain("Secret Section");

  // Malformed addresses get the same answer.
  await b.goto("/sections/not-a-real-id");
  await expect(visibleText(b, "Page not found")).toBeVisible();
});
