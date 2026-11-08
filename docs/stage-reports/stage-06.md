# Stage 6 — Products, variants, units and prices: completion report

Date: 8 November 2026 · Status: **complete, awaiting owner approval**

## Objective

Let each business record what it stocks and sells: products in its own sections and categories, versions of a product (e.g. Men's Jalab in S/M/L × White/Black), the units it buys and sells in (a bottle, a carton of 12), and owner-set prices with a full history — without any stock, sales or purchases yet (Stages 7+).

## What was built

| Area | Where |
|---|---|
| Database | Migration `20261108200000_products_variants_units_prices.sql`: `units`, `products`, `product_units`, `product_variants`, `variant_prices`, `variant_costs`; functions `create_product`, `add_product_variant`, `set_variant_price`, `set_variant_cost`; rules, audit, Row-Level Security |
| Products list | `/products`: search by name, brand, **product code (SKU) or barcode**; filter by section, category, Active / Archived / All; price range per product; 25 per page |
| New product | `/products/new`: details, base unit, up to 3 options (e.g. Size, Colour) whose combinations become variants (untick any you don't stock), extra units (carton = 12 pc) with prices, per-variant code, barcode, price, cost and low-stock level; "same price for all" shortcut; automatic product codes such as `MENS-JALA-M-WHI` |
| Product page | `/products/<id>`: variants with prices per unit, cost, low-stock level; change price/cost (old value kept); price history; add, edit, archive, restore variants; add units, change carton size, archive units; product image; edit details; archive/restore product |
| Units page | `/products/units`: the business's units (12 starters: pc, pack, ctn, crate, bag, dz, kg, g, l, ml, m, yd) and its own additions |
| Images | Private storage; JPEG/PNG/WebP up to 5 MB, checked by the file's real content (not its name); shown through 1-hour private links |
| Code | `src/modules/catalog/products/`; `src/components/forms/use-form-action.ts` |

### Rules (enforced by the database, not just the screens)

- Every product, variant, unit, price and cost belongs to one business; links to another business's sections, categories or units are impossible (composite keys).
- A product's category must belong to the product's own section.
- The **base unit** (what stock is counted in) is fixed once the product exists. Pieces can't be split, so a carton of pieces must hold a whole number (12, not 12.5); kilograms and litres may use decimals.
- Product codes (SKU) and barcodes are unique within a business, ignoring capitals. Two variants of one product can't have the same options ("M / White" and "m / white" count as the same).
- **Prices and costs are never overwritten.** A change closes the current price and opens a new one, recording who and when. Only the database functions can write them.
- Prices: two decimals, never negative, stored as exact decimals (no rounding errors). Costs are per base unit with four decimals.
- **Cost prices are hidden from anyone without "See cost prices"** (attendants by default) — by the database, not just the screen.
- Nothing is deleted: products, variants and units are archived and restored. A product always keeps at least one variant.
- Viewing needs `catalog.product.view`; changing products needs `catalog.product.manage`; changing prices needs `pricing.price.update`; costs additionally need `inventory.cost.view`.

## Tests and results (all actually run)

| Check | Where | Result |
|---|---|---|
| Database tests (pgTAP) | My workspace (PostgreSQL 16) | **219 / 219 passed** (168 existing + 51 new) |
| Browser tests (Playwright) | My workspace: local Supabase stand-in + production build | **28 passed, 1 skipped** (the image-storing test: no file-storage service in my workspace) |
| Unit tests (Vitest) | My workspace | **93 / 93 passed** (78 existing + 15 new) |
| Formatting, lint, type-check, build | My workspace | Pass |
| Database tests (pgTAP) | **GitHub: real Supabase PostgreSQL 17** (run 42517702601, log checked) | **219 / 219 passed** |
| Browser tests (Playwright) | **GitHub: official Supabase stack, now including file storage** (same run, log checked) | **29 / 29 passed**, including product images |
| Lint, type-check, unit tests, build; database types match the real database exactly | GitHub (same run) | Pass |

New database tests (`09_products`, 51): starter units for new and existing businesses; product creation with variants, units and prices in one step; base unit auto-added and unchangeable; whole-number cartons for piece-counted goods; category must match the section; unique SKU/barcode/options (ignoring capitals and spaces); a product always has a variant; price history (old row closed, new row opened, who/when recorded); no direct writes to prices or costs; no deletion; costs hidden without permission; attendant can view and see prices but not change anything; **Business A cannot see, change, or link to Business B's products, units or prices**.

New browser tests (7 runs; 2 journeys also on a phone-sized screen):

| Journey | Proves |
|---|---|
| Men's Jalab, Size × Colour (desktop **and phone**) | 6 combinations, one unticked; price for all; own SKU, barcode and cost on one; bad price (12.345) refused without losing the form; automatic codes; price change kept in history; duplicate options and duplicate SKU refused when adding a variant; archive a variant; search by name, SKU and barcode |
| Malt drink by the bottle and carton | Half a bottle per carton refused; carton of 12 with its own price; low-stock level; add a pack of 6 with a price for all variants; change carton size to 24; business adds its own unit and it is offered for new products |
| Attendant (desktop **and phone**) | Sees products and selling prices; **cost price not on the page at all**; no change buttons; cannot open "New product" |
| Another business | Owner B opening Owner A's product address sees "Page not found"; A's product is not in B's search |
| Product images | A text file named `.png` is refused; a real PNG is stored, shown through a private temporary link, and removed (storing runs on GitHub only) |

### Proving the tests can fail

I broke the new rules on purpose and re-ran the database tests; every break was caught:

| Deliberate break | Result |
|---|---|
| Costs visible to everyone | Caught |
| Anyone with view rights can change prices | Caught |
| Price change overwrites the old price | Caught |
| A carton of 12.5 pieces allowed | Caught |
| Products readable by other businesses | Caught |
| Category from another section allowed | Caught |
| Base unit can be changed | Caught |
| Option values compared with capitals ("M / White" vs "m / white") | Caught |

The migration was restored exactly afterwards (verified by file comparison).

### Problems found and fixed

1. **"M / White" and "m / white" were accepted as two different variants** (found by the browser test). The database now compares option values ignoring capitals and spacing; a new database test guards it.
2. **A refused form lost everything typed** (found by the browser test): after "this code is already used", the whole Add-variant form was empty. Product forms now keep what was typed when the server says no, and clear only after a successful save.
3. Database types file was assembled incorrectly on the first push (GitHub's "types up to date" check caught it); rebuilt and verified identical to the generated version.
4. Price labels wrapped awkwardly on wide screens ("Price / per / piece") — fixed after checking screenshots.
5. Test-script fixes (not app defects): form fields located by their row instead of internal IDs; the price history also lists cost changes, so the test expects three entries.

## Known limitations

- **Forms from earlier stages** (sections, staff, settings) still clear themselves when the server refuses a save. The new helper fixes this for products; applying it to older forms is a small follow-up — say if you want it now.
- **Image storage could only be tested on GitHub**, not in my workspace (its file-storage service can't run here). It passed there against the real Supabase storage.
- **Price changes take effect immediately.** Scheduling a future price ("from 1 December") is not built.
- **Options are per product** (each product names its own, e.g. Size/Colour or Volume), not a shared business-wide list. Simpler and enough for your shop; a shared list can be added later.
- **No bulk import** of products from a spreadsheet yet (useful once you have hundreds).
- **Cost entered here is a starting estimate.** From Stage 7–10, real purchase costs will be recorded with each stock receipt.
- Up to 3 options and 200 variants per product.
- Real phones not tested yet (Stage 14).

## Decisions taken in this stage (please confirm)

| Decision | Plain-language reason |
|---|---|
| Base unit fixed after creation | Stock (Stage 7) is counted in it; changing it later would make old stock numbers wrong. |
| A price per unit (bottle *and* carton) rather than calculated | You set carton prices yourself (often a discount); the system never guesses. |
| Prices and costs kept as history, changed only through checked database functions | You can always see what something cost on a given day; nobody can quietly rewrite a price. |
| Cost per base unit, visible only with "See cost prices" | Attendants see selling prices, not your margins. |
| Product images stored privately, reached through short-lived links | Pictures of your stock aren't public on the internet. |
| Automatic product codes when left empty | Faster entry; you can still type your own. |
| Section required, category optional | Every product sits in a department for reports; small shops needn't create categories. |

## Acceptance status

| Stage 6 requirement | Status |
|---|---|
| Products: create, view, edit, search, archive, restore | Done, browser-tested |
| Products belong to a section (and optional category) of the same business | Enforced by composite keys; tested |
| Variants (e.g. size × colour) with SKU and barcode | Done, browser- and database-tested |
| Units and conversions (carton of 12) | Done; whole-number rule for countable goods tested |
| Owner-set prices with history | Done; history append-only and tested |
| Cost price hidden from unauthorised staff | Enforced by the database; browser-tested |
| Search by name, SKU, barcode | Done, browser-tested |
| Product images | Done; storing tested on GitHub with real storage |
| Exact decimal money (no floating point) | Done; database numeric + decimal.js; unit-tested |
| Tenant isolation | Database- and browser-tested |
| Responsive interfaces | Desktop and phone-size browser tests; screenshots checked |

**Recommendation:** accept Stage 6. Next is **Stage 7 — Core inventory**: opening stock, adding, deducting, adjusting, counting and writing off stock, with the previous and new balance on every movement, and a warning (not a block) when stock would go negative.
