# Stage 4 — Authentication and business accounts: completion report

Date: 6 November 2026 · Status: **complete, awaiting owner approval**

## Objective

Let owners register, sign in and create their business; let staff join by invitation; protect every page; and provide profile, business settings, feature (module) switches, staff management and role permissions — without any product or stock features yet.

## What was built

| Area | Screens / files |
|---|---|
| Sign-up, sign-in, sign-out | `/sign-up`, `/sign-in`; account menu → Sign out |
| Password reset | `/forgot-password` → email link → `/auth/confirm` → `/reset-password` |
| Email links | `/auth/confirm` accepts both link styles Supabase sends (default templates work unchanged) |
| Page protection | `src/proxy.ts`: signed-out visitors are sent to sign-in (and returned to the page they wanted afterwards); signed-in users skip sign-in pages. Pages and the database check again independently. |
| Safe redirects | After sign-in you can only be sent to a page inside the app (`src/lib/safe-redirect.ts`) |
| Onboarding | `/onboarding`: create a business (name, address, currency, time zone, contacts) and pick features; ticking Credit also ticks Sales and Customers. Pending invitations appear here with Accept / Decline. |
| Several businesses per person | Business switcher in the sidebar; the chosen business is remembered in a cookie that is only a preference (membership re-checked on every request) |
| Profile | `/profile`: name, phone; change password (current password required) |
| Settings → Business | Business details; currency shown but fixed |
| Settings → Preferences | Negative stock, low-stock alerts, receipt text; sales-related settings appear only while Sales is on |
| Settings → Features | Switch optional modules on/off with dependency rules and plain-language errors |
| Settings → Staff | Invite by email with a role; change role; suspend / restore; withdraw invitations |
| Settings → Roles | Create roles; tick/untick permissions per role; owner role locked |
| Module gates | Pages of switched-off modules show "switched off" even when typed into the address bar |
| Database (3 migrations) | Invitations and staff directory; currency/status protections; **2 fixes** (below) |
| Exact decimals | Pattern for numeric columns: read as text, write as exact strings (`src/lib/supabase/decimal-column.ts`) — groundwork for prices in Stage 6 |
| Database types | `src/types/database.ts` generated from the real database; GitHub fails the build if it gets out of date |

### How staff join (no extra email service needed)

The owner enters the person's email and role → the person creates an account (or signs in) with that **confirmed** email → they see the invitation and accept it. The app does not send the invitation email itself; the owner tells the person directly. Sending invitation emails can be added later.

## Tests and results (all actually run)

| Check | Where | Result |
|---|---|---|
| Browser tests — complete journeys (Playwright) | My workspace: real Supabase Auth + data API + PostgreSQL, built from Supabase's official releases | **16 / 16 passed**, twice in a row; 0 server errors in the log |
| Browser tests (Playwright) | **GitHub: official full Supabase stack** (runs 42200515907 and 42202080430, logs checked) | **16 / 16 passed** |
| Database tests (pgTAP) | Workspace (PostgreSQL 16, two setups) and GitHub (Supabase PostgreSQL 17) | **135 / 135 passed** |
| Unit tests (Vitest) | Workspace and GitHub | **70 / 70 passed** |
| Formatting, lint, type-check (against generated database types), build | Workspace and GitHub | Pass |

The 16 browser tests (14 on a desktop browser; the 2 core journeys also on a Pixel 7-sized phone):

| Journey | Proves |
|---|---|
| Owner signs up → creates business with Credit → menu shows Sales, Customers, Credit, not Accounting → signs out → protected page redirects to sign-in → signs in → lands on the page first requested | Registration, onboarding, feature dependencies, logout, protected routes (desktop **and phone**) |
| Sign-up form mistakes | Clear messages for bad email, short password, mismatch |
| Wrong password | Same general message for wrong password and unknown email |
| `?next=https://evil…` | Never redirected to another website |
| Tampered session cookie | Treated as signed out |
| Forgot password | Same answer for unknown emails; real reset email → link → new password works, old one doesn't |
| Business details | Saved and shown; currency fixed |
| Preferences | Saved and reloaded |
| Features | Sales can't be switched off while Credit needs it; switching off hides the menu; typing `/sales` shows "switched off" |
| Profile | Name change appears in the menu; wrong current password refused |
| Staff | Owner invites → attendant signs up, sees and accepts invitation → attendant can view but not change business settings, features, staff or roles → owner suspends → attendant loses access on the next page (desktop **and phone**) |
| Roles | Owner adds a permission to Attendant; it persists |
| Forged business cookie | Owner B pointing the cookie at Business A still only sees Business B |
| Two businesses | Switching between them works |

### Real bugs found by testing (fixed)

1. **Inviting staff was impossible while Sales was off** (found by a database test). "Can you hand out this permission?" wrongly required the permission's module to be switched on. Separated into "can you *use* it now" and "is it yours to *hand out*" (migration `…120100`).
2. **Accepting an invitation always failed** (found by the browser tests). This was a Stage 3 bug: the rule "a business must keep one owner" runs when changes are saved, as the person saving, and a new attendant cannot see the owner. My database tests had missed it because they never save (they undo every change). Fixed (migration `…120200`), and a new database test now reproduces it: **it fails without the fix and passes with it.**
3. **Role editor could delete hidden permissions** (found while writing the code): saving a role would have silently removed its permissions for switched-off features. Saving now only touches permissions of features that are on.
4. **Money precision**: generated types showed decimal columns arriving as JavaScript numbers. They are now read as text and written as exact strings.
5. **Build/runtime warnings** with Next.js 16 pre-rendering (database read before cookies; the auth library reading the clock). Database access now happens only while serving a real request; the server log is clean.

Test-script problems I fixed along the way (not app defects): business names reused between runs; Next.js keeping the previous page hidden in the background (tests now only look at visible elements); email decoding in the reset test.

## Known limitations

- **Invitation emails are not sent by the app** — the owner tells the person. (Supabase still sends confirmation and password-reset emails.)
- **Email confirmation is off in local testing** so tests can sign up instantly. **Production must have it on** (deployment guide updated); invitations depend on confirmed emails.
- **Changing your sign-in email** is not available yet.
- **Two-factor sign-in** for owners is planned for later (docs/14).
- **Real phones not tested yet** — phone-sized browser only (Stage 14).
- My workspace's Supabase is assembled from official release files rather than Docker images; GitHub's run on the official full stack confirms the same results.
- The pre-Stage-4 placeholder pages (Sections, Products, etc.) remain placeholders until their stages.

## Decisions taken in this stage

| Decision | Plain-language reason |
|---|---|
| Staff join by invitation + sign-up with the same email | No extra email service or admin key needed; only people who control that email can join |
| Pages behind sign-in are checked three times (proxy, page, database) | A mistake in one layer can't expose data |
| Owner-only defaults kept for features and roles; managers can invite only roles whose permissions they hold | Prevents staff giving themselves or others more power |
| Database values with decimals read as text | Prepares for exact prices and money in later stages |
| Settings show read-only notes rather than hiding pages | Staff understand why they can't change something |

## Acceptance status

| Stage 4 requirement | Status |
|---|---|
| Owner registration | Done, browser-tested |
| Login and logout | Done, browser-tested (desktop + phone) |
| Password reset | Done, tested end to end with the real email link |
| Email verification where configured | Supported (`/auth/confirm`); on in production, off in local tests |
| Protected routes and secure session handling | Done; tampered session and open-redirect tested |
| User profile management | Done, tested |
| Business creation and onboarding | Done, tested |
| Business name and contact details | Done, tested |
| Business settings | Done, tested |
| Business membership management | Invite, accept, decline, withdraw, role change, suspend — tested |
| Multiple businesses per user possible | Done (switcher), tested |
| Authentication and membership enforced on the server | Done; database rules from Stage 3 + server checks + proxy |
| Tests: registration, login, logout, session expiry, unauthorized access, isolation | All present and passing |
| No product or inventory functionality | Respected |

**Recommendation:** accept Stage 4. Next is **Stage 5 — Sections and categories** (e.g. Groceries, Frozen Food, Beverages, Islamic Wear, Clothing & Accessories, each with its categories).
