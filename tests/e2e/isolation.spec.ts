import { expect, test } from "@playwright/test";
import { createBusiness, signUp, uniqueEmail, topBar, visibleText } from "./helpers";

test("a forged 'active business' cookie cannot open someone else's business", async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage();
  await signUp(a, "Owner A", uniqueEmail("iso-a"));
  await createBusiness(a, "Business Alpha");
  const alphaId = (await a.context().cookies()).find(
    (c) => c.name === "rbms_active_business",
  )?.value;
  expect(alphaId).toBeTruthy();

  const b = await (await browser.newContext()).newPage();
  await signUp(b, "Owner B", uniqueEmail("iso-b"));
  await createBusiness(b, "Business Beta");

  // B forges the cookie to point at A's business.
  const cookie = (await b.context().cookies()).find((c) => c.name === "rbms_active_business")!;
  await b.context().addCookies([{ ...cookie, value: alphaId! }]);
  await b.goto("/settings");
  await expect(topBar(b)).toContainText("Business Beta");
  await expect(b.getByLabel("Business name")).toHaveValue("Business Beta");
  await expect(visibleText(b, "Business Alpha")).toHaveCount(0);
});

test("a person in two businesses can switch between them", async ({ page }) => {
  await signUp(page, "Two Shops", uniqueEmail("switch"));
  await createBusiness(page, "First Shop");
  await page.goto("/onboarding");
  await createBusiness(page, "Second Shop");
  await expect(topBar(page)).toContainText("Second Shop");

  await page.getByRole("button", { name: "Switch business" }).click();
  await page.getByRole("menuitem", { name: "First Shop" }).click();
  await expect(topBar(page)).toContainText("First Shop");
});
