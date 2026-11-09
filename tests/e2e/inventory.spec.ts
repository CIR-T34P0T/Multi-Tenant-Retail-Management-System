import { expect, test, type Browser, type Page } from "@playwright/test";
import { createBusiness, signUp, uniqueEmail, visibleText } from "./helpers";

/** Visible elements only: Next.js keeps the previous page hidden in the background. */
const main = (page: Page) => page.locator("main").filter({ visible: true });
const stockList = (page: Page) =>
  page.getByRole("list", { name: "Stock" }).filter({ visible: true });
const history = (page: Page) =>
  page.getByRole("list", { name: "Stock history" }).filter({ visible: true });
const changeForm = (page: Page) => page.getByRole("form", { name: "Change stock" });

async function addQuickSection(page: Page, name: string) {
  await page.goto("/sections");
  await page.getByRole("button", { name }).filter({ visible: true }).click();
  await expect(
    page.getByRole("list", { name: "Sections" }).filter({ visible: true }),
  ).toContainText(name);
}

/** A drink sold by the bottle and the carton of 12, alerting at 24 bottles. */
async function createMalt(page: Page, section = "Beverages") {
  await page.goto("/products/new");
  await page.getByLabel("Product name").fill("Malt 33cl");
  await page.getByLabel("Section").selectOption({ label: section });
  await page.getByLabel("Counted in (base unit)").selectOption({ label: "Piece (pc)" });
  await page.getByRole("button", { name: "Add a unit" }).click();
  await page.getByLabel("Unit", { exact: true }).selectOption({ label: "Carton (ctn)" });
  await page.getByLabel("Contains (pc)").fill("12");
  await page
    .getByRole("list", { name: "Variants to create" })
    .getByRole("listitem")
    .getByLabel(/^Low-stock alert/)
    .fill("24");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
}

async function openItem(page: Page, name = "Malt 33cl") {
  await page.goto("/inventory");
  await stockList(page)
    .getByRole("link", { name: new RegExp(name) })
    .click();
  await expect(page).toHaveURL(/\/inventory\/items\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function record(
  page: Page,
  what: string,
  quantity: string,
  options: { unit?: string; reason?: string } = {},
) {
  const form = changeForm(page);
  await form.getByLabel("What happened?").selectOption({ label: what });
  await form.getByLabel("Quantity").fill(quantity);
  if (options.unit) await form.getByLabel("Unit").selectOption({ label: options.unit });
  if (options.reason !== undefined) await form.getByLabel(/^(Reason|Note)/).fill(options.reason);
}

const inStock = (page: Page) =>
  page
    .getByText(/^-?\d+(\.\d+)? pc$/)
    .filter({ visible: true })
    .first();

async function ownerWithMalt(browser: Browser, prefix: string, business: string) {
  const page = await (await browser.newContext()).newPage();
  await signUp(page, "Owner", uniqueEmail(prefix));
  await createBusiness(page, business);
  await addQuickSection(page, "Beverages");
  await createMalt(page);
  return page;
}

test("owner records opening stock, additions, deductions and write-offs @mobile", async ({
  page,
}) => {
  await signUp(page, "Musa Owner", uniqueEmail("inv-owner"));
  await createBusiness(page, "Musa Provisions");
  await addQuickSection(page, "Beverages");
  await createMalt(page);

  await page.goto("/inventory");
  await expect(stockList(page)).toContainText("Malt 33cl");
  await expect(stockList(page)).toContainText("0 pc");
  await expect(stockList(page)).toContainText("Out of stock");

  await openItem(page);
  await expect(
    visibleText(page, "No stock recorded yet. Start with the opening stock."),
  ).toBeVisible();

  // Opening stock in cartons, converted to bottles.
  await record(page, "Opening stock (first count)", "2", { unit: "Carton (12 pc)" });
  await expect(changeForm(page)).toContainText("= 24 pc · Stock will be 24 pc");
  await changeForm(page).getByRole("button", { name: "Record opening stock" }).click();
  await expect(visibleText(page, "Opening stock recorded. Stock is now 24.").first()).toBeVisible();
  await expect(history(page).getByRole("listitem")).toHaveCount(1);
  await expect(history(page)).toContainText("Opening stock");
  await expect(history(page)).toContainText("+24 pc");
  await expect(history(page)).toContainText("(2 ctn)");
  await expect(history(page)).toContainText("0 → 24 pc");
  await expect(history(page)).toContainText("Musa Owner");
  // Opening stock is only offered once.
  await expect(changeForm(page).getByLabel("What happened?")).not.toContainText("Opening stock");

  await record(page, "Add stock", "6", { reason: "Delivery from Ade" });
  await changeForm(page).getByRole("button", { name: "Add stock" }).click();
  await expect(visibleText(page, "Stock added. Stock is now 30.").first()).toBeVisible();

  // A deduction needs a reason; the form keeps what was typed.
  await record(page, "Deduct stock", "5");
  await changeForm(page).getByRole("button", { name: "Deduct stock" }).click();
  await expect(
    changeForm(page).getByText("Say why (for example: broken in delivery)"),
  ).toBeVisible();
  await expect(changeForm(page).getByLabel("Quantity")).toHaveValue("5");
  await changeForm(page).getByLabel("Reason").fill("Used for shop guests");
  await changeForm(page).getByRole("button", { name: "Deduct stock" }).click();
  await expect(visibleText(page, "Stock deducted. Stock is now 25.").first()).toBeVisible();

  // Half a bottle is refused; a damaged carton is written off.
  await record(page, "Damaged", "1.5", { reason: "Leaking" });
  await changeForm(page).getByRole("button", { name: "Write off" }).click();
  await expect(changeForm(page).getByText("This item is counted in whole numbers")).toBeVisible();
  await record(page, "Damaged", "1", { unit: "Carton (12 pc)", reason: "Carton dropped" });
  await changeForm(page).getByRole("button", { name: "Write off" }).click();
  await expect(visibleText(page, "Write-off recorded. Stock is now 13.").first()).toBeVisible();

  // Below zero is refused while the business does not allow it.
  await record(page, "Deduct stock", "20", { reason: "Party order" });
  await expect(changeForm(page)).toContainText("Stock will be -7 pc");
  await changeForm(page).getByRole("button", { name: "Deduct stock" }).click();
  await expect(changeForm(page).getByText(/Not enough stock: only 13 available/)).toBeVisible();
  await expect(main(page).getByText("13 pc", { exact: true }).first()).toBeVisible();
  await expect(main(page)).toContainText("Low stock");

  await expect(history(page).getByRole("listitem")).toHaveCount(4);
  await expect(history(page).getByRole("listitem").first()).toContainText("Damaged");
  await expect(history(page).getByRole("listitem").first()).toContainText("Carton dropped");
  await expect(history(page).getByRole("listitem").first()).toContainText("25 → 13 pc");

  // Overview, alerts and filters.
  await page.goto("/inventory");
  const summary = page.getByRole("navigation", { name: "Stock summary" }).filter({ visible: true });
  await expect(summary.getByRole("link", { name: /Low stock\s*1/ })).toBeVisible();
  await summary.getByRole("link", { name: /Low stock/ }).click();
  await expect(page).toHaveURL(/status=low/);
  await expect(stockList(page)).toContainText("Malt 33cl");
  await page.goto("/inventory?status=out");
  await expect(visibleText(page, "Nothing matches")).toBeVisible();

  // Whole history, filtered to write-offs.
  await page.goto("/inventory/movements?kind=writeoff");
  await expect(history(page).getByRole("listitem")).toHaveCount(1);
  await expect(history(page)).toContainText("Malt 33cl");

  // Reconciliation.
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Check stock records" }).click();
  await expect(visibleText(page, "All 1 item matches their stock history.").first()).toBeVisible();
});

test("with negative stock allowed, going below zero needs confirmation", async ({ browser }) => {
  const page = await ownerWithMalt(browser, "inv-neg", "Bisi Drinks");
  await page.goto("/settings/preferences");
  await page.getByRole("switch", { name: /Allow stock to go below zero/ }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(visibleText(page, /saved/i).first()).toBeVisible();

  await openItem(page);
  await record(page, "Opening stock (first count)", "3");
  await changeForm(page).getByRole("button", { name: "Record opening stock" }).click();
  await expect(visibleText(page, "Opening stock recorded. Stock is now 3.").first()).toBeVisible();

  await record(page, "Deduct stock", "5", { reason: "Sold before delivery was entered" });
  await changeForm(page).getByRole("button", { name: "Deduct stock" }).click();
  const warning = changeForm(page)
    .getByRole("alert")
    .filter({ hasText: "Stock will go below zero" });
  await expect(warning).toContainText(
    "This will take stock below zero (3 available). Record it anyway?",
  );
  await expect(main(page).getByText("3 pc", { exact: true }).first()).toBeVisible();
  await warning.getByRole("button", { name: "Record anyway" }).click();
  await expect(visibleText(page, "Stock deducted. Stock is now -2.").first()).toBeVisible();
  await expect(main(page)).toContainText("Below zero");

  await page.goto("/inventory?status=negative");
  await expect(stockList(page)).toContainText("Malt 33cl");
  await expect(stockList(page)).toContainText("-2 pc");
});

test("a stock count corrects stock; the attendant counts, the owner posts @mobile", async ({
  browser,
}) => {
  const owner = await ownerWithMalt(browser, "inv-count", "Kemi Store");
  await openItem(owner);
  await record(owner, "Opening stock (first count)", "13");
  await changeForm(owner).getByRole("button", { name: "Record opening stock" }).click();
  await expect(
    visibleText(owner, "Opening stock recorded. Stock is now 13.").first(),
  ).toBeVisible();

  const attendantEmail = uniqueEmail("inv-staff");
  await owner.goto("/settings/staff");
  await owner.getByLabel("Their email address").fill(attendantEmail);
  await owner.getByRole("button", { name: "Save invitation" }).click();
  await expect(visibleText(owner, /Invitation saved/)).toBeVisible();

  await owner.goto("/inventory/counts");
  await owner.getByLabel("What to count").selectOption({ label: "Beverages" });
  await owner.getByLabel("Note (optional)").fill("End of month");
  await owner.getByRole("button", { name: "Start count" }).click();
  await expect(owner).toHaveURL(/\/inventory\/counts\/[0-9a-f-]{36}$/);
  await expect(owner.getByRole("heading", { level: 1, name: "Count 1 · Beverages" })).toBeVisible();
  const countUrl = new URL(owner.url()).pathname;

  // The attendant counts the shelf but cannot post or change stock directly.
  const staff = await (await browser.newContext()).newPage();
  await signUp(staff, "Tunde Attendant", attendantEmail);
  await staff.getByRole("button", { name: "Accept and join" }).click();
  await expect(staff).toHaveURL(/\/dashboard/);
  await staff.goto("/inventory/counts");
  await staff.getByRole("link", { name: /Count 1 · Beverages/ }).click();
  const box = staff.getByLabel("Malt 33cl");
  await box.fill("10");
  await box.press("Enter");
  const sheet = staff.getByRole("list", { name: "Items to count" });
  await expect(sheet).toContainText("−3 pc short");
  await expect(sheet).toContainText("counted by Tunde Attendant");
  await expect(staff.getByRole("button", { name: "Post count" })).toHaveCount(0);
  await openItem(staff);
  await expect(
    visibleText(staff, "You can view this item's stock but not change it."),
  ).toBeVisible();
  await expect(changeForm(staff)).toHaveCount(0);

  // The owner reviews and posts.
  await owner.goto(countUrl);
  await expect(owner.getByRole("list", { name: "Items to count" })).toContainText("−3 pc short");
  await owner.getByLabel("Show").selectOption({ label: "Differences" });
  await expect(
    owner.getByRole("list", { name: "Items to count" }).getByRole("listitem"),
  ).toHaveCount(1);
  await owner.getByRole("button", { name: "Post count" }).click();
  const dialog = owner.getByRole("alertdialog");
  await expect(dialog).toContainText("1 of 1 items were counted; 1 has a difference.");
  await dialog.getByRole("button", { name: "Post count" }).click();
  await expect(
    visibleText(owner, "Count posted: 1 item counted, 1 adjusted.").first(),
  ).toBeVisible();
  await expect(main(owner)).toContainText("Posted");
  await expect(owner.getByRole("list", { name: "Corrections made" })).toContainText("Stock count");
  await expect(owner.getByRole("list", { name: "Corrections made" })).toContainText("13 → 10 pc");

  await openItem(owner);
  await expect(main(owner).getByText("10 pc", { exact: true }).first()).toBeVisible();
  await expect(history(owner).getByRole("listitem").first()).toContainText("Stock count 1");

  // A second count can start once the first is closed; cancelling changes nothing.
  await owner.goto("/inventory/counts");
  await owner.getByRole("button", { name: "Start count" }).click();
  await expect(
    owner.getByRole("heading", { level: 1, name: "Count 2 · Everything" }),
  ).toBeVisible();
  await owner.getByRole("button", { name: "Cancel count" }).click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Cancel count" }).click();
  await expect(visibleText(owner, "Count cancelled. No stock was changed.").first()).toBeVisible();
});

test("another business cannot open stock pages by their address", async ({ browser }) => {
  const a = await ownerWithMalt(browser, "inv-a", "Alpha Drinks");
  await openItem(a);
  const itemUrl = new URL(a.url()).pathname;
  await a.goto("/inventory/counts");
  await a.getByRole("button", { name: "Start count" }).click();
  await expect(a).toHaveURL(/\/inventory\/counts\/[0-9a-f-]{36}$/);
  const countUrl = new URL(a.url()).pathname;

  const b = await (await browser.newContext()).newPage();
  await signUp(b, "Owner Beta", uniqueEmail("inv-b"));
  await createBusiness(b, "Beta Drinks");
  for (const url of [itemUrl, countUrl, "/inventory/items/not-an-id"]) {
    await b.goto(url);
    await expect(visibleText(b, "Page not found")).toBeVisible();
    expect(await b.content()).not.toContain("Malt 33cl");
  }
  await b.goto("/inventory");
  await expect(visibleText(b, "No items yet")).toBeVisible();
});

test.describe("inventory works with every optional module off", () => {
  test("no optional module is needed", async ({ page }) => {
    await signUp(page, "Lone Owner", uniqueEmail("inv-core"));
    await createBusiness(page, "Core Only Shop");
    await addQuickSection(page, "Beverages");
    await createMalt(page);
    await openItem(page);
    await record(page, "Opening stock (first count)", "1", { unit: "Carton (12 pc)" });
    await changeForm(page).getByRole("button", { name: "Record opening stock" }).click();
    await expect(
      visibleText(page, "Opening stock recorded. Stock is now 12.").first(),
    ).toBeVisible();
    await expect(inStock(page)).toBeVisible();
  });
});
