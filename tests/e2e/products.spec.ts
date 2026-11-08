import { expect, test, type Page } from "@playwright/test";
import { createBusiness, signUp, uniqueEmail, visibleText } from "./helpers";

/** Visible elements only: Next.js keeps the previous page hidden in the background. */
const visible = (page: Page) => page.locator("main").filter({ visible: true });
const variantList = (page: Page) =>
  page.getByRole("list", { name: "Variants" }).filter({ visible: true });
const productList = (page: Page) =>
  page.getByRole("list", { name: "Products" }).filter({ visible: true });
const variantRow = (page: Page, label: string) =>
  variantList(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(label, { exact: true }) });

/** One variant row of the "New product" form. */
const newRow = (page: Page, label: string) =>
  page
    .getByRole("list", { name: "Variants to create" })
    .getByRole("listitem")
    .filter({ has: page.getByText(label, { exact: true }) });

/** A smallest-possible valid PNG (1×1 pixel). */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function addQuickSection(page: Page, name: string) {
  await page.goto("/sections");
  await page.getByRole("button", { name }).filter({ visible: true }).click();
  await expect(
    page.getByRole("list", { name: "Sections" }).filter({ visible: true }),
  ).toContainText(name);
}

async function addCustomSection(page: Page, name: string) {
  await page.goto("/sections");
  await page.getByLabel("Section name").fill(name);
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(visibleText(page, `Section "${name}" created.`)).toBeVisible();
}

/** Fills the top of the "New product" form. */
async function startProduct(page: Page, name: string, section: string, baseUnit = "Piece (pc)") {
  await page.goto("/products/new");
  await page.getByLabel("Product name").fill(name);
  await page.getByLabel("Section").selectOption({ label: section });
  await page.getByLabel("Counted in (base unit)").selectOption({ label: baseUnit });
}

async function createAndOpen(page: Page, name: string) {
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

async function changeValue(
  page: Page,
  trigger: string,
  field: string,
  value: string,
  saved: string,
) {
  await visible(page).getByRole("button", { name: trigger }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(field).fill(value);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(visibleText(page, saved).first()).toBeVisible();
}

test("owner creates a Jalab in sizes × colours with prices, costs and price history @mobile", async ({
  page,
}) => {
  await signUp(page, "Hauwa Owner", uniqueEmail("prod-jalab"));
  await createBusiness(page, "Hauwa Islamic Wear");
  await addCustomSection(page, "Islamic Clothing");

  await page.goto("/products");
  await expect(visibleText(page, "No products yet")).toBeVisible();

  await startProduct(page, "Men's Jalab", "Islamic Clothing");
  await page.getByLabel("Brand (optional)").fill("Al-Noor");
  await page.getByRole("button", { name: "Add option" }).click();
  await page.getByLabel("Values, separated by commas").fill("S, M, L");
  await page.getByRole("button", { name: "Add option" }).click();
  await page.getByLabel("Values, separated by commas").nth(1).fill("White, Black");
  const variantsToCreate = page.getByRole("list", { name: "Variants to create" });
  await expect(variantsToCreate.getByRole("listitem")).toHaveCount(6);

  // One combination is not stocked; prices for the rest in one go.
  await page.getByRole("checkbox", { name: "Create L / Black" }).uncheck();
  await page.getByLabel(/Same price for all/).fill("15000");
  await page.getByRole("button", { name: "Apply to all" }).click();
  await newRow(page, "M / White").getByLabel("Product code (SKU)").fill("JAL-M-WHT");
  await newRow(page, "M / White").getByLabel("Barcode").fill("6151234567890");
  await newRow(page, "M / White")
    .getByLabel(/^Cost per/)
    .fill("9500");

  // Validation: a bad price is caught before anything is saved.
  await newRow(page, "S / Black")
    .getByLabel(/^Price per/)
    .fill("12.345");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(visibleText(page, "Check the highlighted fields.")).toBeVisible();
  await expect(page).toHaveURL(/\/products\/new$/);
  await newRow(page, "S / Black")
    .getByLabel(/^Price per/)
    .fill("14000");

  await createAndOpen(page, "Men's Jalab");
  await expect(variantList(page).getByRole("listitem")).toHaveCount(5);
  await expect(visibleText(page, "L / Black")).toHaveCount(0);
  const mWhite = variantRow(page, "M / White");
  await expect(mWhite).toContainText("JAL-M-WHT");
  await expect(mWhite).toContainText("6151234567890");
  await expect(mWhite).toContainText("15,000.00");
  await expect(mWhite).toContainText("9,500.00");
  // Automatic product codes for the others.
  await expect(variantRow(page, "S / Black")).toContainText(/MENS-JALA-S-BLA/);
  await expect(variantRow(page, "S / Black")).toContainText("14,000.00");

  // Price change: the old price is kept in the history.
  await changeValue(
    page,
    "Change piece price of M / White",
    "New price (NGN)",
    "16500",
    "Price saved.",
  );
  await expect(mWhite).toContainText("16,500.00");
  await mWhite.getByRole("button", { name: "Price history of M / White" }).click();
  const history = page.getByRole("list", { name: "Price history" });
  // Price changes and the cost appear together, newest first.
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history.getByRole("listitem").first()).toContainText("16,500.00");
  await expect(history.getByRole("listitem").first()).toContainText("now");
  await expect(history.getByRole("listitem").nth(1)).toContainText("15,000.00");
  await page.keyboard.press("Escape");

  // Add the missing variant later; a duplicate is refused.
  await visible(page).getByRole("button", { name: "Add variant" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a variant" });
  await dialog.getByLabel("Size").fill("M");
  await dialog.getByLabel("Colour").fill("white");
  await dialog.getByRole("button", { name: "Add variant" }).click();
  await expect(dialog.getByText("A variant with these options already exists.")).toBeVisible();
  await dialog.getByLabel("Size").fill("L");
  await dialog.getByLabel("Colour").fill("Black");
  await dialog.getByLabel("Product code (SKU)").fill("jal-m-wht");
  await dialog.getByRole("button", { name: "Add variant" }).click();
  await expect(
    dialog.getByText("A product code (SKU) is already used. Choose another."),
  ).toBeVisible();
  await dialog.getByLabel("Product code (SKU)").fill("JAL-L-BLK");
  await dialog.getByLabel(/Price per pc/).fill("15000");
  await dialog.getByRole("button", { name: "Add variant" }).click();
  await expect(dialog).toBeHidden();
  await expect(variantList(page).getByRole("listitem")).toHaveCount(6);

  // Archive one variant: it stays on the page, marked archived.
  await variantRow(page, "S / White")
    .getByRole("button", { name: /^Archive / })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(variantRow(page, "S / White")).toContainText("Archived");

  // Find it by name, SKU and barcode.
  for (const q of ["jalab", "JAL-L-BLK", "6151234567890"]) {
    await page.goto(`/products?q=${encodeURIComponent(q)}`);
    await expect(productList(page)).toContainText("Men's Jalab");
  }
  await page.goto("/products?q=agbada");
  await expect(visibleText(page, "No matching products")).toBeVisible();
  await page.goto("/products");
  await expect(productList(page)).toContainText("Al-Noor");
  await expect(productList(page)).toContainText("14,000.00");
  await expect(productList(page)).toContainText("16,500.00");
});

test("a drink sold by the bottle and by the carton of 12", async ({ page }) => {
  await signUp(page, "Emeka Owner", uniqueEmail("prod-carton"));
  await createBusiness(page, "Emeka Drinks");
  await addQuickSection(page, "Beverages");

  await startProduct(page, "Malt Drink 33cl", "Beverages");
  await page.getByRole("button", { name: "Add a unit" }).click();
  await page.getByLabel("Unit", { exact: true }).selectOption({ label: "Carton (ctn)" });
  await page.getByLabel("Contains (pc)").fill("12.5");
  await page.getByLabel(/Price per carton/).fill("6000");
  await newRow(page, "Standard")
    .getByLabel(/^Price per/)
    .fill("550");
  await newRow(page, "Standard")
    .getByLabel(/^Low-stock alert/)
    .fill("24");
  // Pieces cannot be split, so half a bottle per carton is refused.
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(visibleText(page, "Check the highlighted fields.")).toBeVisible();
  await page.getByLabel("Contains (pc)").fill("12");
  await createAndOpen(page, "Malt Drink 33cl");

  const unitsCard = page.getByRole("region", { name: "Units" }).filter({ visible: true });
  const units = unitsCard.getByRole("list", { name: "Units" });
  await expect(units).toContainText("Piece (pc)");
  await expect(units).toContainText("Carton (ctn)");
  await expect(units).toContainText("= 12 pc");
  const row = variantRow(page, "Standard");
  await expect(row).toContainText("550.00");
  await expect(row).toContainText("6,000.00");
  await expect(row).toContainText("24 pc");

  // Add a pack of 6 with a price for all variants; then change the carton size.
  await unitsCard.getByLabel("Unit", { exact: true }).selectOption({ label: "Pack (pack)" });
  await unitsCard.getByLabel("Contains (pc)").fill("6");
  await unitsCard.getByLabel(/Price per unit for all variants/).fill("3200");
  await page.getByRole("button", { name: "Add unit" }).click();
  await expect(visibleText(page, "Unit added.").first()).toBeVisible();
  await expect(units).toContainText("= 6 pc");
  await expect(row).toContainText("3,200.00");
  await changeValue(page, "Edit Carton", "Quantity (pc)", "24", "Unit saved.");
  await expect(units).toContainText("= 24 pc");

  // The business's own units: add one, and see it offered for new products.
  await page.goto("/products/units");
  await page.getByLabel("Name").fill("Sachet roll");
  await page.getByLabel("Symbol").fill("roll");
  await page.getByRole("button", { name: "Add unit" }).click();
  await expect(visibleText(page, 'Unit "Sachet roll" added.')).toBeVisible();
  await page.goto("/products/new");
  await expect(page.getByLabel("Counted in (base unit)")).toContainText("Sachet roll (roll)");
});

test("an attendant sees prices but not costs, and cannot change products @mobile", async ({
  browser,
}) => {
  const ownerEmail = uniqueEmail("prod-owner");
  const attendantEmail = uniqueEmail("prod-staff");
  const owner = await (await browser.newContext()).newPage();
  await signUp(owner, "Fatima Owner", ownerEmail);
  await createBusiness(owner, "Fatima Provisions");
  await addQuickSection(owner, "Groceries");
  await startProduct(owner, "Golden Penny Rice 5kg", "Groceries", "Bag (bag)");
  await newRow(owner, "Standard")
    .getByLabel(/^Price per/)
    .fill("8500");
  await newRow(owner, "Standard")
    .getByLabel(/^Cost per/)
    .fill("7000");
  await createAndOpen(owner, "Golden Penny Rice 5kg");
  const productUrl = new URL(owner.url()).pathname;
  await owner.goto("/settings/staff");
  await owner.getByLabel("Their email address").fill(attendantEmail);
  await owner.getByRole("button", { name: "Save invitation" }).click();
  await expect(visibleText(owner, /Invitation saved/)).toBeVisible();

  const staff = await (await browser.newContext()).newPage();
  await signUp(staff, "Gbenga Attendant", attendantEmail);
  await staff.getByRole("button", { name: "Accept and join" }).click();
  await expect(staff).toHaveURL(/\/dashboard/);

  await staff.goto("/products");
  await expect(visibleText(staff, "You can view products but not change them.")).toBeVisible();
  await expect(staff.getByRole("link", { name: "New product" })).toHaveCount(0);
  await expect(productList(staff)).toContainText("8,500.00");
  await staff.goto(productUrl);
  const row = variantRow(staff, "Standard");
  await expect(row).toContainText("8,500.00");
  await expect(row).not.toContainText("7,000.00");
  await expect(visible(staff)).not.toContainText("Cost per");
  await expect(
    visible(staff).getByRole("button", {
      name: /^(Change .*(price|cost) of|Edit |Archive |Upload)/,
    }),
  ).toHaveCount(0);
  expect(await staff.content()).not.toContain("7,000.00");
  await staff.goto("/products/new");
  await expect(visibleText(staff, "You do not have permission to add products.")).toBeVisible();
});

test("another business cannot open a product by its address", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signUp(a, "Owner Gamma", uniqueEmail("prod-a"));
  await createBusiness(a, "Gamma Frozen Foods");
  await addQuickSection(a, "Frozen Food");
  await startProduct(a, "Secret Chicken Wings", "Frozen Food", "Kilogram (kg)");
  await newRow(a, "Standard")
    .getByLabel(/^Price per/)
    .fill("4200.50");
  await createAndOpen(a, "Secret Chicken Wings");
  await expect(variantRow(a, "Standard")).toContainText("4,200.50");
  const address = new URL(a.url()).pathname;

  const b = await (await browser.newContext()).newPage();
  await signUp(b, "Owner Delta", uniqueEmail("prod-b"));
  await createBusiness(b, "Delta Frozen Foods");
  await b.goto(address);
  await expect(visibleText(b, "Page not found")).toBeVisible();
  expect(await b.content()).not.toContain("Secret Chicken Wings");
  await b.goto("/products?q=Secret");
  await expect(visibleText(b, "No matching products")).toBeVisible();
  await b.goto("/products/not-a-real-id");
  await expect(visibleText(b, "Page not found")).toBeVisible();
});

test("product images: only real pictures are accepted", async ({ page }) => {
  await signUp(page, "Ireti Owner", uniqueEmail("prod-img"));
  await createBusiness(page, "Ireti Accessories");
  await addCustomSection(page, "Accessories");
  await startProduct(page, "Prayer Cap", "Accessories");
  await createAndOpen(page, "Prayer Cap");

  // A text file pretending to be a picture is refused before it is stored.
  await page.getByLabel("Add an image").setInputFiles({
    name: "cap.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is not really a picture"),
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(visibleText(page, "Use a JPEG, PNG or WebP image")).toBeVisible();

  // Storing needs the file-storage service (always running in GitHub CI).
  test.skip(!process.env.STORAGE_AVAILABLE, "File storage is not running in this environment");
  await page.getByLabel("Add an image").setInputFiles({
    name: "cap.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(visibleText(page, "Image saved.").first()).toBeVisible();
  const img = page.getByRole("img", { name: "Prayer Cap" });
  await expect(img).toBeVisible();
  // A private, temporary link — never a public address.
  expect(await img.getAttribute("src")).toMatch(
    /\/storage\/v1\/object\/sign\/product-images\/.+token=/,
  );
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(visibleText(page, "Image removed.").first()).toBeVisible();
  await expect(visibleText(page, "No image")).toBeVisible();
});
