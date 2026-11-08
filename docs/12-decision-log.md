# 12 — Decision Log

Status: v0.3 · 6 November 2026 · **This document overrides earlier docs where they differ.**

Records the owner's answers of 6 November 2026, how each was interpreted, and what changed in the design. Interpretations marked **(confirm)** are my reading of a short answer and should be checked; they appear again in §4.

---

## 1. Answers received

| # | Question | Answer | Decision / interpretation | Status |
|---|---|---|---|---|
| 1 | Hosting (ADR-009, Q-P02, Q-L02) · offline selling (Q-T01) | "Self hosted" | The application and Supabase are **self-hosted** (no Supabase Cloud). Whether this also settles offline selling depends on **where** the server runs — see §3. | Hosting **decided**; offline **open** |
| 2 | Shops (Q-B02) | "One shop" | **Single location.** Data model keeps `locations` so branches can be added later, but MVP UI hides location pickers, transfers and per-location prices. | Decided |
| 3 | Weighed goods (Q-C01) | "Not weighed" | **Whole-unit quantities only** in MVP. Units like piece/pack/carton remain. Decimal support stays in the schema but is not exposed. | Decided |
| 4 | Batches & expiry (Q-C02) | "No batches or expiry" | **Removed from MVP**: no batch tables, batch flows, FEFO or expiry reports. Product flags hidden. | Decided |
| 5 | Clothing variants (Q-C04) | "Skip" | Use the **default: Size and Colour as variant axes**, other details (e.g. fabric) as optional product attributes. All editable by the owner in settings; nothing Jalab-specific is hard-coded. | Default applied |
| 6 | Wholesale vs retail pricing (Q-S02) | "Prices are fixed by user" | **One price per item (and per unit), set by the owner.** One price list ("Standard"); no wholesale list, quantity breaks, customer price lists or location prices. Cashiers **cannot change prices** at the till. (confirm — see §4 Q2) | Decided, detail to confirm |
| 7 | Returns & voids (Q-S03) | "No returns or voids" | **No customer returns, refunds or voids** in MVP. Completed sales cannot be undone. This raises a correction problem — see §4 Q3. | Decided, risk flagged |
| 8 | Credit sales (Q-F01) | "Record in database" | **Credit sales are in MVP**: a sale can be fully or partly "on account" for a named customer; the customer's balance is tracked; later payments are recorded against it. (confirm — see §4 Q4) | Decided, detail to confirm |
| 9 | Stock shortfall (Q-I01) | "Not blocked but warn user" | `allow_negative_stock = true`. POS shows a **warning** naming the item and available quantity; cashier can continue. Negative balances appear on a "Negative stock" report. Resolves **ADR-007**. | Decided |
| 10 | Tax / VAT (Q-F03) | "Ignore" | **No tax in MVP.** Shelf price = final price; no tax lines on receipts or reports. `tax_rates` stays in the schema (empty, hidden) so tax can be switched on later without migration. | Decided |
| 11 | Existing data (Q-M01) | "None exists. It's all new." | **No data migration.** Products, prices and opening stock are entered in the app. An opening-stock screen posts `opening_balance` movements. Spreadsheet import moves to P2 (optional). | Decided |

## 2. Effect on the documents

| Doc | Change |
|---|---|
| 02 Functional | Priorities updated: returns/voids, batches, weighed goods, tax, transfers, multi-price lists → out of MVP; credit sales & customer balances → MVP; negative stock → allowed with warning. |
| 04 Architecture | §16 added: self-hosted deployment. |
| 06 Schema | §19 added: tables deferred from MVP and setting values. |
| 08 Roles | `sales.sale.void`, `sales.return.*`, `sales.price.override`, `inventory.transfer.*` inactive in MVP; `sales.credit.sell`, `receivables.payment.record` active. |
| 09 Workflows | W10 (void), W11 (returns), W14 (transfers) out of MVP; W17 (credit) in MVP; W20 replaced by "first-time setup". |
| 10 MVP | §1 rewritten (v0.2). |
| 11 Questions | Resolved questions marked; remaining ones listed in §4 below. |

### 2.1 Settings for the pilot business (initial values)

| Setting | Value |
|---|---|
| `allow_negative_stock` | `true` (warn at POS) |
| `prices_include_tax` | n/a — tax disabled |
| `cash_rounding_increment` | `0` |
| `require_customer_on_sale` | `false` (required only for credit) |
| `max_discount_pct_without_override` | `0` (pending §4 Q2) |
| `void_window` | `'none'` |
| Locations | 1 store |
| Price lists | 1 ("Standard") |
| Modules enabled | core only; `receivables` on; Expenses/Accounting off |

## 3. Self-hosting — what it means

**Proposed stack on one Linux server (Docker Compose):**

| Component | Purpose |
|---|---|
| Supabase self-hosted stack (PostgreSQL, Auth/GoTrue, PostgREST, Storage, Kong gateway, Studio) | Same features the design relies on: RLS, Auth, Storage, RPC. |
| Next.js app (standalone Node build, container) | The PWA and server actions. |
| Reverse proxy with automatic HTTPS (e.g. Caddy) | TLS is mandatory: PWAs, service workers and camera scanning only work on HTTPS. |
| SMTP provider | Auth needs it for invitations and password resets. |
| Backup job (e.g. pgBackRest or WAL-G + nightly dump) to **off-site** object storage | Replaces the managed backups/PITR of Supabase Cloud. |
| Uptime and error monitoring | Someone must know when it is down. |

**New responsibilities on your side:** server security updates, Supabase and Postgres upgrades, certificate renewal (automated by the proxy), disk space, backups **and tested restores**, and recovery if the server fails. NFR-BCK targets (RPO ≤ 15 min, RTO ≤ 4 h) are achievable only with WAL archiving off the server and a written restore procedure.

**Where the server runs is the remaining big decision:**

| | A. Rented cloud server (VPS) | B. Computer inside the shop |
|---|---|---|
| Internet down at shop | Till cannot reach server → need offline sale queue (ADR-008) | Till keeps working over shop Wi-Fi |
| Power down at shop | Server unaffected; till needs battery/UPS | Server and router need UPS/inverter |
| Owner viewing from home/abroad | Works directly | Needs a secure tunnel (e.g. Cloudflare Tunnel or Tailscale) |
| HTTPS | Standard domain + certificate | Still needs a real domain/tunnel for valid HTTPS on phones |
| Theft, damage, disk failure | Provider's problem (still need backups) | Shop's problem — off-site backups essential |
| Running cost | Monthly rent | Hardware + UPS once; electricity |

My recommendation: **A + offline sale queue** if the shop's internet is usually available; **B** only if internet at the shop is frequently down for long periods.

## 4. Defaults accepted ("use defaults", 6 Nov 2026)

| # | Topic | Decision |
|---|---|---|
| Q1 | Server location / offline | **Rented cloud server (VPS)**, self-hosted stack. **No offline sale queue in the first release** — this follows the Prompt Collection (§5 below), which overrides my earlier default. The app shows offline status clearly and never shows a sale as saved until the server confirms it. Offline selling is a later stage. |
| Q2 | Prices fixed | **No discounts and no price changes at the till.** Only users with `pricing.price.update` change prices. |
| Q3 | Correcting mistakes | **Owner-only cancellation on the same day.** A cancellation keeps the original sale, marks it cancelled, and posts reversing stock and payment records; fully audited. No customer returns. |
| Q4 | Credit | **Optional credit limit per customer; part-payments allowed**; optional due date. |
| Q5 | Staff | **Owner + attendants.** One cash drawer per till, shared; each sale records who sold it. |

ADRs in doc 11 §3 are accepted as recommended, with ADR-008 changed to "no offline queue in the first release".

## 5. Reconciliation with the Prompt Collection (authoritative spec)

`Complete_Retail_Management_System_Prompt_Collection.docx` (Part 2, "finalized master prompt") is treated as the product source of truth; your direct answers in §1 and §4 set the **pilot business's configuration**. Where they differ:

| # | Prompt Collection says | Earlier docs said | Resolution (v0.3) |
|---|---|---|---|
| 1 | Hierarchy **Business → Sections → Categories → Products → Variants**. Sections are departments (Groceries, Frozen Food, Islamic Wear…), not branches. | No sections; categories only; "locations" for branches. | **Added `sections`.** Every category belongs to one section; products carry section + category. Dashboard and inventory filter by section. Locations stay as a separate, future branch concept (pilot: one location, hidden). |
| 2 | **Sales, purchases, suppliers, customers, credit, expenses, accounting, analytics are optional modules.** Inventory works with all of them off. | Sales, purchasing, customers, suppliers were core. | **Made optional.** Core = tenancy, users & permissions, settings, sections & catalogue, pricing, inventory (manual add/deduct/adjust/count/write-off), dashboard, core inventory reports, audit. Pilot enables Sales, Purchases, Suppliers, Customers, Credit. |
| 3 | Credit requires sales + customers. | Credit under customers. | Documented and enforced as a module dependency. |
| 4 | Every stock movement stores **previous and new balance**. | Only signed quantity. | **Added `balance_before` / `balance_after`** to `stock_movements`. |
| 5 | Returns and cancellations create reversal records. | Pilot: no returns or voids. | Platform supports **cancellation with reversal** (used by the pilot owner, Q3). **Customer returns are built in Stage 9 but switched off** for the pilot by a setting. |
| 6 | Fractional quantities for goods sold by weight. | Pilot: not weighed. | Platform supports decimals per unit; pilot units are whole-number. No conflict. |
| 7 | Expiry alerts (Stage 8). | Pilot: no expiry. | Expiry alerting only active for products with expiry tracking; pilot has none. Batch tables stay deferred. |
| 8 | Do not build complex offline sync in the first release. | Offline queue recommended. | **Follow the spec**: no offline queue in first release (Q1). |
| 9 | Hosting: Vercel or other suitable provider. | — | **Self-hosted** per your answer (VPS, Docker). |
| 10 | Roles: owner and attendants with configurable permissions. | Six role templates. | Templates kept; **"Attendant"** is the default staff role (combines cashier + store-keeping permissions). Owner can tick/untick permissions per role. |
| 11 | Docs: PRD, functional, non-functional, architecture, schema, module dependencies, roles, workflows, roadmap, **testing strategy, security model**. | Testing and security spread across docs. | **Added doc 13 (Testing Strategy) and doc 14 (Security Model).** File-name mapping in README. |
| 12 | Build in **15 stages**, each with tests and a completion report. | Phases 0–5. | **Adopted the 15-stage plan** as the implementation sequence (doc 10 §5). Stage 1 (documentation) = this pack. |

## 7. Decisions taken while building

### Stage 6 — Products, variants, units and prices (8 Nov 2026)

| Decision | Reason |
|---|---|
| Options (Size, Colour…) are named per product, up to 3; variants are their combinations | Simpler than a business-wide attribute list; enough for the pilot. A shared list can be added later without breaking data. |
| Base unit fixed after a product is created | Stock is counted in it from Stage 7. |
| Each unit (bottle, carton) has its own owner-set price; never calculated | Owner sets prices (§1); carton prices are often discounted. |
| Prices and costs are history tables written only by `set_variant_price` / `set_variant_cost` | Past prices stay visible and unalterable. |
| Cost stored per base unit; readable only with `inventory.cost.view` | Attendants don't see margins. Real purchase costs arrive with Stage 10. |
| Images in a private bucket via the server (service key, after an RLS check); 1-hour signed links | Stock photos are not public. |
| Variant options compared ignoring capitals and spacing | "M / White" and "m / white" are the same variant. |

## 6. Next

Stage 1 is complete pending your approval of v0.3. On approval I start **Stage 2 — Project initialization and foundation** (no business features yet): Next.js + TypeScript + Tailwind + shadcn/ui setup, Supabase clients, app shell, `.env.example`, lint/type-check/build passing, plus the self-hosted Docker Compose files for local and server use.
