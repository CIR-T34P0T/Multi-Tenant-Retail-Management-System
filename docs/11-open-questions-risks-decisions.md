# 11 — Open Questions, Risks and Architectural Decisions

Status: v0.3 · 6 November 2026 — all blocking questions resolved; see doc 12 §4–§5

> **Update 6 Nov 2026:** the owner answered most blocking questions. Resolved: Q-B02 (one shop), Q-C01 (not weighed), Q-C02 (no batches/expiry), Q-C04 (default Size × Colour), Q-S02 (single owner-set price), Q-S03 (no returns/voids), Q-F01 (credit sales recorded), Q-I01 (allow + warn), Q-F03 (tax ignored), Q-M01 (no existing data), ADR-007 (allow + warn), ADR-009 (self-hosted). **See `12-decision-log.md` for details and the remaining questions.**

This is the most important document to review before implementation. Where the brief did not say something, the other documents **do not invent an answer**; they point here.

- **Blocking** = must be answered before Phase 1 build of the affected area.
- **Default if unanswered** = what I would build if you prefer to decide later. Defaults are proposals, not decisions.

---

## 1. Open questions

### 1.1 Business & operations (B)

| ID | Question | Why it matters | Blocking? | Default if unanswered |
|---|---|---|---|---|
| Q-B01 | Who works in the business and what do they do (owner on-site or remote, managers, cashiers, store keeper, accountant)? Roughly how many staff use the system? | Determines roles, approvals, four-eyes rules and whether one person does everything. | Yes | 6 default roles (doc 08); Owner may self-approve. |
| Q-B02 | How many shops/warehouses today? Is stock held in a separate store room or warehouse? Any plans for more branches? | Multi-location transfers, location scoping, numbering per location. | Yes | Model supports many; MVP UI built for 1–3 locations, transfers included. |
| Q-B03 | Typical volumes: number of products/variants, sales per day, items per sale, peak hours? | Sizing, performance tests, offline cache size. | No | Envelope in NFR-SCL-001. |
| Q-B04 | Who supports the staff day to day (training, "it's not working"), and in what hours? Who owns the business relationship? | Support model, monitoring, admin tooling priority. | No | You provide remote support during business hours. |

### 1.2 Product / commercial (P)

| ID | Question | Why it matters | Blocking? | Default |
|---|---|---|---|---|
| Q-P01 | Is the reusable product intended to be sold (SaaS subscriptions) or reused by you for clients one by one? Pricing model? | Billing, self-sign-up, plan limits, legal terms. | No (Phase 4) | Shared multi-tenant platform; billing later. |
| Q-P02 | What monthly running budget is acceptable for the pilot (hosting, database, SMS)? Who pays? | Supabase plan (backups/PITR), hosting tier, SMS usage. | Yes (for ADR-009) | Paid Supabase tier with daily backups; PITR if budget allows. |

### 1.3 Users & devices (U / T)

| ID | Question | Why it matters | Blocking? | Default |
|---|---|---|---|---|
| Q-U01 | What devices will be used at the till and in the store: desktop PC, laptop, Android phones/tablets, iPhones? Barcode scanners and receipt printers already owned (models)? | PWA behaviour, printing approach, camera scanning, UI layout priorities. | Yes | Android phone + one Windows/ Chromebook POS; USB keyboard scanner; 80 mm USB thermal printer via browser print. |
| Q-U02 | Do several cashiers share one device? Should staff switch quickly with a PIN? | Quick-switch auth, per-cashier accountability. | No | PIN quick switch for POS devices. |
| Q-U03 | Should staff sign in with phone number + OTP instead of email? | SMS cost and provider; some staff may lack email. | No | Email/password; invite by email. |
| Q-U04 | UI languages needed besides English? | i18n workload. | No | English only, strings externalised. |
| Q-T01 | How reliable are internet and power at the shop? Must the POS keep selling during outages? For how long? | Biggest architectural fork: offline sale queue (ADR-008). | **Yes** | Build offline cash sales queue in MVP. |
| Q-T02 | Is there a backup power source (inverter/generator) for the POS and router? | Whether offline needs to cover hours or minutes. | No | Assume outages of up to a few hours. |
| Q-T03 | Which specific phone models should we test on? | Performance budget, camera scanning. | No | 2–3 common mid-range Android models + 1 iPhone. |

### 1.4 Catalogue (C)

| ID | Question | Why it matters | Blocking? | Default |
|---|---|---|---|---|
| Q-C01 | Are frozen foods (or anything else) sold by weight? If yes, is weight read from a scale, entered by hand, or are items pre-packed with fixed weights/prices? Are cartons sold whole with variable weight? | Decimal quantities, price per kg, variable-weight cartons, scale integration. | Yes (frozen) | Decimal kg entry by hand; no scale integration. |
| Q-C02 | Does the business need to track batch numbers and expiry dates (groceries, frozen, drinks)? Does it currently remove expired stock in a structured way? | Batch tables, FEFO, expiry reports, receiving UX complexity. | Yes | Flags present; batch flows off until confirmed. |
| Q-C03 | Are drinks sold with returnable bottles/crates and deposits? | Deposit accounting and container stock. | No | Not supported in MVP. |
| Q-C04 | For Jalab and other clothing: which attributes define a variant (size, colour, fabric, length, style)? What size system (S–XXL, numeric, age)? | Variant axes and templates. | Yes (clothing setup) | Size × Colour axes; others as product attributes. |
| Q-C05 | Is any clothing made-to-measure or tailored to order (measurements, deposits, collection dates)? | Would need an orders module, not just a catalogue. | No | Ready-made only. |
| Q-C06 | Do products already have manufacturer barcodes? Should the system print its own barcode labels for items without one (e.g. clothing)? | Label printing feature and printer type. | No | Use existing barcodes; label printing P2. |

### 1.5 Sales & payments (S)

| ID | Question | Why it matters | Blocking? | Default |
|---|---|---|---|---|
| Q-S01 | Sales channels: walk-in only, or also phone/WhatsApp orders, deliveries, online? | Order and delivery workflows. | No | Walk-in POS only. |
| Q-S02 | Are there different prices for wholesale vs retail customers, or bulk/quantity discounts? Different prices per branch? Do some customers need formal invoices? | Price lists, quantity breaks, location pricing, invoice documents. | Yes | One "Retail" price list; schema ready for more. |
| Q-S03 | Return and void policy: are returns accepted? Within how many days? Without receipt? Refund in cash or exchange only? | Return rules and approvals. | Yes | Returns with receipt only, manager approval, refund by original method. |
| Q-S04 | Who may give discounts and how much? | Thresholds and overrides. | No | All discounts need Manager. |
| Q-S05 | Should cash totals be rounded (e.g. to the nearest ₦5/₦10/₦50)? Is there a recurring problem with small change? | Rounding setting and its accounting. | No | No rounding. |
| Q-S06 | How should receipts be given: printed, WhatsApp, SMS, email, none? | Messaging integrations and costs. | No | Printed + shareable PDF/image via the phone's share sheet. |
| Q-S07 | Which payment methods are common (cash, bank transfer, POS terminals — which providers, mobile money)? Should payments be confirmed automatically? | Payment methods list; future integrations. | No | Methods recorded manually with reference numbers. |
| Q-S08 | Does each cashier have their own cash drawer/float, or one drawer per till shared by several people? | Cash session model. | Yes | One session per device; each sale records the cashier. |

### 1.6 Finance (F)

| ID | Question | Why it matters | Blocking? | Default |
|---|---|---|---|---|
| Q-F01 | Do customers buy on credit and pay later? How is this tracked today? | Receivables module, credit limits, statements. | Yes | Not in MVP (P2). |
| Q-F02 | Does the business buy on credit from suppliers and need to track what it owes? | Payables module. | No | Not in MVP. |
| Q-F03 | Is the business VAT-registered and are shelf prices VAT-inclusive? Which items are exempt? (Confirm current rules with its accountant.) | Tax configuration and receipts. | Yes | Configure one "VAT" rate and "Exempt"; prices tax-inclusive; values set by the owner. |
| Q-F04 | What does "financial management" mean for you: expense tracking, cash book, profit reports, budgeting, double-entry books, or all? | Splits Finance-lite (Expenses) from full Accounting. | No (Phase 3) | Expenses module + Accounting module as separate options. |
| Q-F05 | Will a Nigerian accountant review the chart of accounts template and event→journal mapping? | Correctness of financial statements. | No (Phase 3) | Required before Accounting goes live. |

### 1.7 Inventory (I)

| ID | Question | Why it matters | Blocking? | Default |
|---|---|---|---|---|
| Q-I01 | Should selling be blocked when the system shows insufficient stock, or allowed and flagged? | Accuracy vs never refusing a customer. | Yes | Block online; allow and flag for offline-synced sales. |
| Q-I02 | Any required costing method (weighted average vs FIFO)? | Margin and valuation correctness. | No | Weighted average (ADR-006). |
| Q-I03 | Who may write off damaged/expired stock, and does it need approval? | Shrinkage control. | No | Negative adjustments need Manager approval. |
| Q-I04 | Is stock bought from markets without a formal supplier? Are purchase orders sent to suppliers today? | Optional supplier on receipts; PO priority. | No | Supplier optional on receipts; POs in P2. |
| Q-I05 | Should transport/offloading costs be added to product cost? | Landed cost apportionment. | No | Not in MVP. |

### 1.8 Legal & data (L / M)

| ID | Question | Why it matters | Blocking? | Default |
|---|---|---|---|---|
| Q-L01 | Who is the data controller, and have obligations under the Nigeria Data Protection Act 2023 been reviewed (and GDPR if you operate from or serve the EU)? | Privacy notices, consent, processing agreements. | Before go-live | Minimal personal data; anonymisation function; legal review recommended. |
| Q-L02 | Any requirement on where data is hosted? | Supabase region choice. | Yes (Phase 0) | Region with best measured latency, documented. |
| Q-L03 | How long must sales and stock records be kept? | Retention/purge policies. | No | Keep indefinitely while active. |
| Q-M01 | In what form does product, price and stock data exist today (paper, Excel, another app)? Will someone count opening stock before go-live? | Import tooling and go-live plan. | Yes (before migration) | XLSX import template; full physical count at go-live. |

### 1.9 Questions about your own goals

| ID | Question |
|---|---|
| Q-X01 | Who will build and maintain this — you alone, or a team? This affects how much automation (CI, tests) vs speed we prioritise and how I sequence implementation tasks. |
| Q-X02 | Is there a target go-live date or business event (e.g. a festive season) driving the timeline? |

---

## 2. Risks

Likelihood/Impact: H high · M medium · L low.

| ID | Risk | L | I | Mitigation |
|---|---|:-:|:-:|---|
| R01 | **Connectivity/power outages stop sales** if the POS needs the server. | H | H | Offline sale queue (ADR-008); decide Q-T01 early; test on real network conditions. |
| R02 | **Cross-tenant data leak** through a missing RLS policy or a server route using the service-role key. | M | H | RLS on every table by migration template; composite FKs; pgTAP isolation tests in CI; service-role use restricted to audited server modules. |
| R03 | **Stock drift** (levels ≠ ledger) from bugs or direct writes. | M | H | Single write path (`apply_stock_movement`), revoked client privileges, nightly reconciliation alert. |
| R04 | **Over-generic design slows delivery** (trying to support every retailer up front). | H | M | Build for the pilot's confirmed needs on a generic core; defer templates/other verticals to Phase 4. |
| R05 | **Scope creep from accounting** before operations are stable. | M | M | Accounting strictly Phase 3; event outbox from day one so nothing needs redesign. |
| R06 | **Offline conflicts** (stock, prices) create confusing data. | M | M | Accept-and-flag policy; review screen; small cache TTL warnings; device clock checks. |
| R07 | **iOS PWA limitations** (no background sync, storage eviction, camera quirks). | M | M | Prefer Android/desktop for POS; foreground sync; warn on iOS; test in Phase 0. |
| R08 | **Thermal printing from the browser** is unreliable or slow on some printers/phones. | M | M | Phase 0 spike with the actual printer; fallback to PDF share; consider a small print helper app later. |
| R09 | **Inaccurate opening data** undermines trust from day one. | H | M | Structured import with validation; physical count at go-live; first-week daily stock spot checks. |
| R10 | **Staff resistance / training gaps.** | M | M | Simple POS flows, quick training, on-site support for first days, in-app help. |
| R11 | **Frequent price changes** (inflation) cause wrong prices at the till. | H | M | Bulk updates, price-change prompts after receiving, price-change report, effective-dated prices. |
| R12 | **Fraud / shrinkage** (voids, discounts, unrecorded sales). | M | H | Permissions, overrides, blind cash close, audit log, void/discount reports, stock counts. |
| R13 | **Decimal/rounding errors** in money and kg quantities. | M | H | `numeric` in DB, decimal library in TS, unit tests on pricing/tax/rounding. |
| R19 | **Completed sales cannot be corrected** (no voids/returns) → cashier mistakes leave wrong stock and cash. | H | M | Doc 12 Q3: owner-only same-day cancel, or adjustment + pay-out procedure. |
| R20 | **Self-hosted server failure or neglected updates.** | M | H | Monitoring, automated security updates, documented rebuild + restore; consider a managed VPS. |
| R14 | **Vendor dependency** on Supabase/hosting (outages, pricing changes). | L | M | Standard Postgres + SQL functions are portable; keep business logic out of proprietary features where possible. |
| R15 | **Latency from Nigeria to the database region** makes the app feel slow. | M | M | Measure in Phase 0; catalogue caching on device; minimise round-trips (one RPC per sale). |
| R16 | **Single developer bus factor** (if Q-X01 = solo). | M | H | ADRs, docs, tests, conventional stack, infrastructure as code. |
| R17 | **Data protection non-compliance.** | L | H | Legal review (Q-L01), minimal data, anonymisation, access logs. |
| R18 | **Backups not restorable when needed** — higher now that hosting is self-managed. | M | H | Scheduled restore tests (NFR-BCK-003). |

---

## 3. Architectural decisions requiring approval

| ADR | Decision | Recommendation | Alternatives considered | Status |
|---|---|---|---|---|
| ADR-001 | Multi-tenancy model | Shared database & schema, `business_id` on every row, RLS + composite FKs | Schema per tenant; database per tenant | Proposed |
| ADR-002 | Where transactional logic lives | Postgres `SECURITY DEFINER` posting functions for money/stock invariants; TS server actions for orchestration/validation | All logic in TS with client-side transactions; Edge Functions | Proposed |
| ADR-003 | Attribute value storage | JSONB on products/variants validated against attribute definitions; GIN indexes | Classic EAV table; per-category columns | Proposed |
| ADR-004 | Optional module integration | Transactional outbox (`business_events`) + asynchronous consumers | Synchronous calls from posting functions; DB triggers that write journals inline | Proposed |
| ADR-005 | Enabling accounting later | Start date + opening balances + optional back-posting of events | Require accounting from day one; no back-posting | Proposed |
| ADR-006 | Inventory costing | Weighted average per location & variant; purchase returns at average cost; negative-stock receipts handled by resetting average to receipt cost | FIFO layers; standard cost | Proposed (Q-I02) |
| ADR-007 | Negative stock | Allowed with a warning at the POS; flagged on a negative-stock report | Always block | **Decided** (owner) |
| ADR-008 | Offline POS | **First release online-only**; clear offline indicator; nothing shown as saved until server confirms; idempotent `post_sale` kept so an offline queue can be added later | Offline outbox in first release | **Decided** (v0.3) |
| ADR-009 | Hosting | **Self-hosted** Supabase stack + Next.js on Docker, HTTPS reverse proxy, off-site WAL backups; server location open (doc 12 Q1) | Supabase Cloud + Vercel | **Decided** (owner); location open |
| ADR-010 | Money & quantity types | `numeric(18,2)` money, `numeric(18,4)` quantity, decimal library in TS, strings over the wire | Integer minor units (kobo) | Proposed |
| ADR-011 | Roles per member | One role per member per business (MVP) | Multiple roles per member | Proposed |
| ADR-012 | Currency | One currency per business (NGN for pilot); currency code stored | Multi-currency transactions | Proposed |
| ADR-013 | Stock location granularity | Stock per location; no bins/shelves | Bin-level stock | Proposed |
| ADR-014 | Prices & history | Effective-dated price rows with no-overlap constraint; sales snapshot prices | Overwrite price + separate history log | Proposed |
| ADR-015 | Variants | Every product has ≥ 1 variant; stock, price and barcode live on variants | Optional variants with stock on product | Proposed |

---

## 4. Requirements gaps found in the brief

These are not questions of detail but missing areas worth a conscious decision:

1. **Cash control** (tills, floats, cash-up) is not mentioned but is central to retail in a cash-heavy market — included in MVP as a proposal.
2. **Returns, refunds and voids** — not mentioned; proposed with conservative defaults.
3. **Customer credit** — common in many retail settings; not mentioned (Q-F01).
4. **Tax** — not mentioned; needs owner/accountant input (Q-F03).
5. **Hardware** — scanners, printers, devices not specified (Q-U01).
6. **Offline operation** — PWA is required, but whether selling must continue offline is not stated (Q-T01).
7. **Data migration and go-live** — existing data source unknown (Q-M01).
8. **Audit and fraud controls** — not stated; proposed as core.
9. **Backup, recovery and support** — not stated; proposed targets in NFR-BCK and Q-B04.
10. **Commercial model for the reusable product** — not stated (Q-P01).
11. **Data protection** — not stated (Q-L01).

## 5. What I need from you to start implementation

1. Approve or amend the ADRs in §3 (especially 001, 002, 004, 006, 008).
2. Answer the **Blocking** questions: Q-B01, Q-B02, Q-P02, Q-U01, Q-T01, Q-C01, Q-C02, Q-C04, Q-S02, Q-S03, Q-S08, Q-F01, Q-F03, Q-I01, Q-L02, Q-M01.
3. Confirm the MVP scope in doc 10 §1.
4. Optionally answer Q-X01 and Q-X02 so I can sequence the work realistically.
