import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery-1";

let counter = 0;
/** A unique email per test run so tests never collide. */
export function uniqueEmail(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}@e2e.test`;
}

export async function signUp(page: Page, name: string, email: string, password = PASSWORD) {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function createBusiness(page: Page, name: string, features: string[] = []) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Business name").fill(name);
  // Unique address per run, so repeated test runs never collide.
  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)}-${Date.now().toString(36)}`;
  await page.getByLabel("Business address (short name)").fill(slug.replace(/-+/g, "-"));
  for (const f of features) await page.getByRole("checkbox", { name: new RegExp(`^${f}`) }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Opens the account menu and signs out. Works on phones (menu panel) and desktop. */
export async function signOut(page: Page) {
  await openMenuIfMobile(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

export async function openMenuIfMobile(page: Page) {
  const viewport = page.viewportSize();
  const alreadyOpen = await page.getByRole("button", { name: "Account menu" }).isVisible();
  if (viewport && viewport.width < 768 && !alreadyOpen) {
    await page.getByRole("button", { name: "Open or close menu" }).click();
  }
}

/** Visible text only (Next.js keeps the previous page hidden in the background). */
export function visibleText(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true });
}

/** The visible top bar. (Next.js keeps the previous page hidden in the background.) */
export function topBar(page: Page) {
  return page.locator("header").filter({ visible: true });
}

export function sidebar(page: Page) {
  return page.locator("[data-sidebar=content]");
}

/**
 * Reads the newest email sent to an address and returns the first link in it.
 * Local stack: emails saved as files (MAIL_DIR). CI: Mailpit API (MAILPIT_URL).
 */
export async function latestEmailLink(to: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const raw = await readLatestEmail(to);
    // Undo email "quoted-printable" encoding (soft line breaks, =3D) before searching.
    const body = raw
      ?.replace(/=\r?\n/g, "")
      .replace(/=3D/g, "=")
      .replace(/&amp;/g, "&");
    const link = body?.match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]*/)?.[0];
    if (link) return link;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email with a link arrived for ${to}`);
}

async function readLatestEmail(to: string): Promise<string | null> {
  if (process.env.MAILPIT_URL) {
    const res = await fetch(
      `${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const list = (await res.json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (!id) return null;
    const msg = (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
      HTML?: string;
      Text?: string;
    };
    return `${msg.Text ?? ""}\n${msg.HTML ?? ""}`;
  }
  const dir = process.env.MAIL_DIR;
  if (!dir) throw new Error("Set MAILPIT_URL or MAIL_DIR to read test emails");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(`${to}.eml`))
    .sort();
  if (files.length === 0) return null;
  return readFileSync(join(dir, files[files.length - 1]), "utf8");
}
