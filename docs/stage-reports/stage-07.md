# Stage 7 — Core inventory: completion report

Date: 9 November 2026 · Status: **complete, awaiting owner approval**

## Objective

Track how much of every item the shop has, record every change to it in a permanent ledger, and support stock counts, write-offs and low-stock alerts. Inventory is a core module: it works with every optional module (sales, purchases, accounting…) switched off.

## What was built

| Area | Where |
|---|---|
| Database | Migration `20261109090000_core_inventory.sql`: `stock_levels`, `stock_movements` (ledger), `stock_counts`, `stock_count_lines`; functions to record changes, run counts, read stock and check records |
| Inventory page | `/inventory`: every item with its stock and status; tiles for items, low stock, out of stock, below zero (each opens the matching list); search by name, brand, product code or barcode; filters by section, category and stock level; archived items on request; **Check stock records** button |
| Item page | `/inventory/items/<id>`: current stock and status, low-stock level, units; **Change stock** form (opening stock, add, deduct, write off as damaged / expired / missing / other loss) with a live preview (*2 cartons = 24 pc · stock will be 48 pc*); full history |
| History | `/inventory/movements`: every change in the business, newest first; filter Added / Deducted / Write-offs / Counts |
| Stock counts | `/inventory/counts`: start a count of everything, one section or one category; counting sheet that saves each line as you type, shows *in system*, *−3 pc short* / *+2 pc extra* / *Matches*, search and "not counted yet" / "differences" filters; post (with a summary) or cancel |
| Code | `src/modules/inventory/` (rules, data loading, actions, screens) |
| Settings | The negative-stock switch now reads **"Allow stock to go below zero"**, because it now covers deductions as well as sales |

### Rules (enforced by the database, not just the screens)

- **Stock only changes through a movement**, written in the same transaction as the new balance. The stock tables are read-only to every user; nobody can edit or delete a movement, not even a database administrator (a database trigger refuses it).
- Every movement records: business, item, kind, quantity (in the base unit), **balance before and after**, what was entered (e.g. 2 cartons × 12), reason, who and when; and the stock count it came from. A column is ready for the related sale or purchase (Stages 9–10).
- **Simultaneous changes are safe**: each item's balance is locked while it changes, so two people deducting at the same moment never lose an update.
- **Negative stock**: refused while *Allow stock to go below zero* is off (the default for a new business). When it is on, the person sees a warning and must press **Record anyway**.
- **Units and fractions**: quantities can be entered in any unit of the product (a carton of 12 becomes 12 pieces). Items counted in pieces stay whole numbers (half a carton of 12 is fine, a tenth is not); items counted in kg or litres accept up to 4 decimals.
- Opening stock is recorded once per item; after that, "Add stock". Deductions and write-offs **require a reason**.
- Archived items cannot have stock changes.
- **Stock counts**: one count open at a time. The difference is *counted − system quantity at the moment that line was counted*, so sales made while counting are not undone. Items not counted are left unchanged. Posting writes "Stock count N" corrections into the ledger and closes the count; counts are in the audit log.
- **Low / out of stock**: *low* = at or below the item's low-stock level (set on the product page); *out* = zero; *below zero* shown separately.
- **Reconciliation**: *Check stock records* proves every balance equals the sum of its movements and the last recorded balance.
- Who may do what (default roles, changeable in Settings › Roles): owner and manager add, deduct, write off, start and post counts; attendant views stock and history and enters counts.

## Tests and results (all actually run)

| Check | Where | Result |
|---|---|---|
| Database tests (pgTAP) | My workspace (PostgreSQL 16) | **305 / 305 passed** (219 existing + 86 new) |
| Concurrency test: 20 sessions deduct 1 at the same instant | My workspace | **Passed**: final stock 80, 20 movements, no broken links |
| Browser tests (Playwright) | My workspace: local Supabase stand-in + production build | **35 passed, 1 skipped** (the image-storing test; no file storage here); 0 errors in the server log |
| Unit tests (Vitest) | My workspace | **99 / 99 passed** (93 existing + 6 new) |
| Formatting, lint, type-check, build | My workspace | Pass |
| Database tests (pgTAP) | **GitHub: real Supabase PostgreSQL 17** (run 42585611847, log checked) | **305 / 305 passed** |
| Concurrency test | **GitHub: real Supabase** (same run) | **Passed** (80 / 20 / 0) |
| Browser tests (Playwright) | **GitHub: official Supabase stack with file storage** (same run) | **36 / 36 passed** |
| Formatting, lint, type-check, unit tests, build; database types match the real database | GitHub (same run) | Pass |

New database tests (`10_inventory`, 86): balances created automatically; opening stock in cartons; ledger contents (type, base quantity, balances, entered unit, who); opening only once; add; deduct needs a real reason; damaged/expired/missing/other write-offs; zero, negative and over-precise quantities refused; whole-number rule (½ carton of 12 ok, 1.2 pieces not); kilograms accept fractions exactly; units the product doesn't use refused; negative stock refused, then allowed only with confirmation; ledger cannot be edited, deleted or written directly (API and administrator); balances cannot be changed directly; archived items refused; overview statuses, filters (low, out, section, search by name and code, archived), paging total and summary; attendant can view but not change; manager can; **Business B cannot see, change, count or check Business A's stock**; counts: attendant cannot start or post, one open at a time, lines for the chosen section, system quantity recorded when counted, bad counts refused, sales during counting kept, only differences posted and linked to the count, closed counts cannot change, empty count cannot post, cancel changes nothing, audit entries; history shows who; **1,000 random changes** — every balance equals its movements and every movement starts where the previous ended; a tampered balance is detected.

New browser tests (7 runs; 2 journeys also on a phone-sized screen):

| Journey | Proves |
|---|---|
| Owner records stock (desktop **and phone**) | Opening stock in cartons with preview; history line *Opening stock +24 pc (2 ctn), 0 → 24 pc, by …*; add; deduct refused without reason (typing kept); half a bottle refused; damaged carton; below-zero refused with stock unchanged; low-stock alert and filter; write-off history filter; *All 1 item matches their stock history* |
| Negative stock allowed | Setting switched on; warning with *Record anyway*; stock −2, *Below zero* filter |
| Stock count (desktop **and phone**) | Owner starts a section count; attendant enters 10 (system 13) → *−3 pc short*, cannot post or change stock; owner filters differences, posts (*1 item counted, 1 adjusted*); stock 10; correction in history; second count started and cancelled |
| Another business | Item and count addresses show "Page not found" and none of the data |
| Optional modules off | Inventory works for a business with no optional modules |

### Proving the tests can fail

I broke each rule on purpose and re-ran the tests; every break was caught:

| Deliberate break | Caught by |
|---|---|
| Item balance not locked during a change | Concurrency test (lost updates) |
| Negative stock always allowed | 9 database tests |
| Ledger protection trigger removed | 5 database tests |
| Stock history readable by other businesses | Isolation test |
| Count ignores sales made during counting | 2 database tests |
| Attendants allowed to write off | Role test |
| Balance not updated with the movement | Test run fails |
| Opening stock allowed twice | 12 database tests |
| Deductions without a reason | Test run fails |

The migration was restored exactly afterwards (verified by file comparison).

### Problems found and fixed

1. **My own test was wrong at first**: it expected ¼ carton of 12 to be refused, but that is exactly 3 bottles and correctly accepted. Replaced with a real fraction (1.2 bottles).
2. **The 1,000-random-changes test silently did nothing** at first (a type mismatch stopped the loop, but the checks after it still passed on the few existing movements). Found by reading the log; fixed, and a test now confirms all 1,000 changes were recorded.
3. After recording cartons, the unit stayed on "Carton" for the next entry — easy to add 6 cartons by mistake. The form now returns to the base unit after each save.
4. "Low-stock alert at 0 pc" was shown instead of "No low-stock alert set" (found in screenshots).
5. Clearer success messages ("Stock added.", "Write-off recorded.") instead of "Added recorded.".

## Known limitations

- **No costs on stock movements yet**, so no stock value report. Cost price stays on the product (Stage 6); weighted average cost comes with purchases (Stage 10).
- **No approval step** for large adjustments (the permission exists, unused).
- **One shop only**: no locations or transfers (as agreed). Adding branches later needs one migration.
- Counts are entered in the base unit (e.g. pieces, not "3 cartons + 4 pieces").
- No barcode scanning yet (camera scanning is planned with the phone/PWA work, Stage 14).
- Low-stock **notifications** (not just highlighting) come in Stage 8 with the dashboard.
- Real phones not tested yet (Stage 14).

## Decisions taken in this stage (please confirm)

| Decision | Plain-language reason |
|---|---|
| Stock can only change through the ledger; nothing is ever edited or deleted | You can always see exactly how stock reached its current number. |
| Opening stock once per item, then "Add stock" | Keeps the first count separate from later deliveries. |
| Reason required for deductions and write-offs | Losses must be explained. |
| Negative stock off by default for a new business; when on, a warning to confirm | Your answer "not blocked but warn". Switch on in **Settings › Preferences** for your shop. |
| Attendants count but don't post counts or change stock (by default) | You or a manager review before stock is corrected. Changeable per role. |
| Items not counted in a count stay unchanged | Partial counts (e.g. just drinks) don't zero out everything else. |
| Archived items can't have stock changes | Restore first. |

## Acceptance status

| Stage 7 requirement | Status |
|---|---|
| Current stock per product/variant; filter by section, category, product, stock status | Done, browser- and database-tested |
| Add, deduct, adjust after counts, damaged/expired/missing/written-off, reasons | Done, tested |
| Ledger with business, item, type, quantity, previous and new balance, reason, user, time, related transaction | Done (related transaction column ready for Stages 9–10) |
| Low stock, out of stock, configurable minimum levels | Done (levels set on the product) |
| Stock counting with controlled adjustments and audit trail | Done, tested |
| All changes create ledger entries; balances maintained efficiently; reconciliation | Done; 1,000-change test; reconciliation button |
| Database functions, transactions; concurrency safe | Done; 20-session test on real Supabase |
| Negative quantities only with explicit business policy | Done, tested both ways |
| Unit conversions and fractional quantities | Done, tested |
| Works without any optional module | Browser-tested |

**Recommendation:** accept Stage 7. Next is **Stage 8 — Dashboard and notifications**: one business-wide dashboard with a section filter (products and variants, sections, stock overview, low-stock and out-of-stock items, recent stock movements) and in-app inventory alerts.
