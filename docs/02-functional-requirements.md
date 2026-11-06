# 02 — Functional Requirements

Status: v0.2 · 6 November 2026 — priorities updated from the owner's answers (see `12-decision-log.md`)

## How to read this document

- IDs are `FR-<AREA>-<NNN>` and are stable; later docs and tests reference them.
- **Priority:** `MVP` = needed for the pilot go-live · `P2`/`P3`/`P4` = roadmap phase (see doc 10) · `TBC` = blocked on an open question (doc 11), do not build until answered.
- **Source:** `C` = confirmed in the brief · `P` = proposed by design, needs approval · `Q-xxx` = depends on that question.
- "The system shall" is implied for each row.

| Area code | Area |
|---|---|
| PLT | Platform & tenancy |
| IAM | Identity, users & access |
| CFG | Configuration & modules |
| CAT | Catalogue (categories, attributes, products, variants) |
| UOM | Units of measure |
| PRC | Pricing & tax |
| INV | Inventory |
| PUR | Purchasing & suppliers |
| SAL | Sales & POS |
| RET | Returns, refunds & voids |
| CSH | Cash sessions & payments |
| CUS | Customers & receivables |
| EXP | Expenses (optional module) |
| ACC | Accounting (optional module) |
| RPT | Reporting & dashboards |
| AUD | Audit & activity |
| OFF | Offline operation |
| IMP | Import / export |
| NTF | Notifications |

---

## PLT — Platform & tenancy

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-PLT-001 | Support multiple independent businesses in one deployment. | MVP | C |
| FR-PLT-002 | Isolate each business's data (users' memberships, products, inventory, transactions, settings, files) so no user can read or change another business's data unless they are a member of it. | MVP | C |
| FR-PLT-003 | Allow one user account to be a member of several businesses with a different role in each, and to switch the active business explicitly. | MVP | P |
| FR-PLT-004 | Allow a business to have one or more **locations** of type store or warehouse, each holding its own stock. | MVP (1 location; multi-location UI later) | P · Q-B02 |
| FR-PLT-005 | Store per business: legal name, display name, address, phone, logo, currency, time zone, country, tax identifiers (optional). | MVP | P |
| FR-PLT-006 | Allow a platform administrator to create a business, assign its first owner, and suspend/reactivate it. | MVP | P |
| FR-PLT-007 | Allow creation of a business from a **business template** (seed categories, attributes, units, roles, payment methods, reason codes). | P4 (pilot template seeded manually in MVP) | P |
| FR-PLT-008 | Self-service business sign-up and subscription billing. | P4 · TBC | Q-P01 |
| FR-PLT-009 | Platform-admin access to a tenant's data only through an explicit, time-limited, audited support session. | P2 | P |

## IAM — Identity, users & access

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-IAM-001 | Sign in with email + password. | MVP | P |
| FR-IAM-002 | Sign in with phone number + one-time code (SMS/WhatsApp). | TBC | Q-U03 (cost & provider) |
| FR-IAM-003 | Password reset by email. | MVP | P |
| FR-IAM-004 | Owners/managers invite staff by email (and/or phone, Q-U03), assigning a role and allowed locations. | MVP | P |
| FR-IAM-005 | Suspend or remove a member; suspended members lose access immediately on next request. | MVP | P |
| FR-IAM-006 | Role-based permissions using a fixed permission catalogue; each business can use default roles and create custom roles. | MVP (defaults) / P2 (custom roles UI) | P |
| FR-IAM-007 | Restrict a member to specific locations; location-bound data (sales, stock, cash sessions) is filtered accordingly. | MVP | P |
| FR-IAM-008 | Quick cashier switching on a shared POS device using a personal PIN, without full sign-out. | TBC | Q-U02 |
| FR-IAM-009 | Manager override: a user with the right permission can authorise a restricted action (e.g. price override, void) on another user's screen by entering their PIN/credentials; both users are recorded. | MVP | P |
| FR-IAM-010 | Session timeout configurable per business; POS devices may stay signed in longer than back-office sessions. | P2 | P |
| FR-IAM-011 | Two-factor authentication for owners and platform admins. | P2 | P |

## CFG — Configuration & modules

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-CFG-001 | Maintain a module registry; each business has each optional module enabled or disabled. | MVP | C (req. 6) |
| FR-CFG-002 | Enabling a module checks its dependencies; disabling a module is blocked if an enabled module depends on it. | MVP | P |
| FR-CFG-003 | When a module is disabled: its menus, screens, API actions and permissions are hidden/inert; its existing data is retained read-only (not deleted). | MVP | P |
| FR-CFG-004 | Disabling Accounting or Expenses must not change the behaviour, validation or performance of sales, purchasing or inventory. | MVP | C (req. 7) |
| FR-CFG-005 | Business settings including at minimum: allow negative stock (yes/no), prices tax-inclusive (yes/no), rounding rule for cash totals, require customer on sale (yes/no), receipt header/footer, default price list, default location. | MVP | P |
| FR-CFG-006 | Configurable document numbering per business, location and document type (prefix, padding, next number). | MVP | P |
| FR-CFG-007 | Configurable payment methods (cash, bank transfer, card/POS terminal, mobile money, customer credit, other) with flags: affects cash drawer, requires reference. | MVP | P |
| FR-CFG-008 | Configurable reason codes for adjustments, damage, expiry, returns, voids. | MVP | P |
| FR-CFG-009 | All settings changes are audited (who, when, old value, new value). | MVP | P |

## CAT — Catalogue

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-CAT-001 | Hierarchical product categories per business (unlimited depth; UI may limit to 3 levels). | MVP | C (req. 5) |
| FR-CAT-002 | Attribute definitions per business with data type: text, number (optional unit), yes/no, date, single-select (options), multi-select (options). | MVP | C (req. 5) |
| FR-CAT-003 | Assign attributes to categories, marking each as required/optional and as product-level or variant-level. Sub-categories inherit parent attributes. | MVP | P |
| FR-CAT-004 | Products have: name, description, category, brand (optional), product type (stocked / non-stocked / service), base unit, tax rate, images, attribute values, status. | MVP | C/P |
| FR-CAT-005 | Every product has at least one **variant**; a product without variant axes has a single default variant. Stock, barcode, SKU and price are held per variant. | MVP | C (req. 8) |
| FR-CAT-006 | Generate variants from the cross-product of selected variant-axis values (e.g. Sizes S–XXL × 3 colours), with the ability to deselect combinations that do not exist. | MVP | P |
| FR-CAT-007 | Unique SKU per business, auto-generated by a configurable pattern or entered manually. | MVP | P |
| FR-CAT-008 | Multiple barcodes per variant, each optionally tied to a unit (e.g. piece barcode vs carton barcode). Barcode is unique within a business. | MVP | P |
| FR-CAT-009 | Archive (not delete) products and variants that have transactions; hard delete only if no transactions exist. | MVP | P |
| FR-CAT-010 | Search products by name, SKU, barcode and attribute values; filter by category and attribute. | MVP | P |
| FR-CAT-011 | Per-product flags: track inventory, track batches/lots, track expiry dates. | Out (no batches/expiry) | Q-C02 |
| FR-CAT-012 | Product bundles/kits (e.g. a gift hamper) that deduct component stock. | P4 | P |
| FR-CAT-013 | Made-to-measure / tailoring orders for clothing (measurements, deposits, production status). | TBC | Q-C05 |
| FR-CAT-014 | Reorder level and reorder quantity per variant (optionally per location). | MVP | P |

## UOM — Units of measure

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-UOM-001 | Per-business unit list (e.g. piece, pack, carton, crate, kg, g, litre, yard, metre) with kind (count/mass/volume/length) and whether decimals are allowed. | MVP | C (req. 8) |
| FR-UOM-002 | Each product has one base unit; stock is always stored and reported in base units. | MVP | P |
| FR-UOM-003 | Each product may have additional units with a conversion factor to the base unit (e.g. carton = 24 pieces) and flags: can sell, can purchase. | MVP | C/P |
| FR-UOM-004 | Selling or buying in any allowed unit converts to base units for stock movements; the transaction line keeps the entered unit, quantity and factor. | MVP | P |
| FR-UOM-005 | Weighed goods: quantities with up to 3 decimal places for units that allow decimals (e.g. 1.250 kg). | Out (not weighed) | Q-C01 |
| FR-UOM-006 | Changing a conversion factor affects only future transactions; historical lines keep their stored factor. | MVP | P |
| FR-UOM-007 | Scale integration (reading weight from a connected scale). | Out | Q-C01 |

## PRC — Pricing & tax

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-PRC-001 | Price lists per business (at least one default, e.g. "Retail"). | MVP (single 'Standard' list) | P |
| FR-PRC-002 | Prices set per variant + unit + price list, optionally per location, optionally with a minimum quantity (quantity breaks). | MVP (variant + unit only) | C (req. 8) · Q-S02 |
| FR-PRC-003 | Prices are effective-dated; a price change closes the current price and opens a new one. Future-dated price changes are allowed. | MVP | C (req. 8) |
| FR-PRC-004 | Full price history per variant: old price, new price, effective from, changed by. | MVP | P |
| FR-PRC-005 | Bulk price update by category/brand/selection: set value, increase/decrease by % or amount, with preview before applying. | MVP | P |
| FR-PRC-006 | Show current average cost and margin % next to the price when editing (only to users with the cost permission). | MVP | P |
| FR-PRC-007 | Price resolution at sale time: customer's price list → default list; location-specific over general; highest qualifying quantity break; latest effective record. | MVP | P |
| FR-PRC-008 | Line and cart discounts (amount or %) subject to permission and configurable maximum without override. | TBC (doc 12 Q2) | P · Q-S04 |
| FR-PRC-009 | Price override at POS subject to permission/override; original list price and override user are stored. | Out (prices fixed) | P |
| FR-PRC-010 | Tax rates per business (name, %); product default tax rate; tax-inclusive or tax-exclusive pricing per business. | Out (schema only, tax ignored) | P · Q-F03 |
| FR-PRC-011 | Promotions (buy X get Y, time-limited offers). | P4 | P |
| FR-PRC-012 | Rounding of cash totals to a configurable increment. | Out | P · Q-S05 |

## INV — Inventory

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-INV-001 | Record every stock change as an immutable stock movement with: business, location, variant, batch (optional), movement type, signed quantity in base units, unit cost, source document type/id/line, reason, user, business time, recorded time. | MVP | C (req. 9) |
| FR-INV-002 | Movement types at minimum: opening balance, purchase receipt, purchase return, sale, sale return, sale void (reversal), transfer out, transfer in, adjustment in, adjustment out, count variance, damage, expiry, internal use. | MVP | P |
| FR-INV-003 | No stock quantity may change except through a movement. Movements cannot be edited or deleted; corrections are reversing movements linked to the original. | MVP | C/P |
| FR-INV-004 | Maintain current on-hand quantity per location per variant (and per batch where tracked), updated in the same database transaction as the movement. | MVP | P |
| FR-INV-005 | Inventory costing using **weighted average cost** per location and variant (proposed), recalculated on each receipt. | MVP | P · ADR-006 |
| FR-INV-006 | Negative stock: allowed or blocked per business setting. If allowed, the system flags negative balances for review. | MVP — allowed with warning | P · Q-I01 |
| FR-INV-007 | Stock adjustments (header + lines) with reason code, note, optional approval above a threshold. | MVP | P · Q-I03 |
| FR-INV-008 | Stock transfers between locations: draft → dispatched (stock leaves source) → received (stock arrives at destination); received quantity may differ, difference recorded as a variance with reason. | Later (one shop) | Q-B02 |
| FR-INV-009 | Stock counts (stocktake): full or partial (by category/selection); snapshot of expected quantity at start; blind count option; review variances; post count variance movements. | MVP | P |
| FR-INV-010 | Damage, spoilage and expiry write-offs with reason codes. | MVP | P |
| FR-INV-011 | Batch/lot and expiry tracking for flagged products; FEFO (first-expiry-first-out) suggested at sale; expiring-soon report. | Out | Q-C02 |
| FR-INV-012 | Stock card per variant/location: chronological movements with running balance, each linked to its source document. | MVP | C (req. 9) |
| FR-INV-013 | Low-stock list based on reorder levels. | MVP | P |
| FR-INV-014 | Inventory valuation report (quantity × average cost) at a chosen date. | MVP | P |
| FR-INV-015 | Opening stock import from spreadsheet for go-live. | MVP (manual entry screen); import P2 | P |
| FR-INV-016 | Returnable containers (bottles/crates) deposit tracking. | TBC | Q-C03 |
| FR-INV-017 | Stock reservations (e.g. for held sales or orders). | P3 | P |

## PUR — Purchasing & suppliers

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-PUR-001 | Supplier records: name, contact person, phone, email, address, payment terms, notes. | MVP | P |
| FR-PUR-002 | Goods receipt (GRN): supplier, location, supplier invoice reference, date, lines (variant, unit, quantity, unit cost, batch/expiry if tracked), posting creates purchase-receipt movements and updates average cost. | MVP | C (purchases) |
| FR-PUR-003 | Goods receipt without a purchase order (direct receiving). | MVP | P |
| FR-PUR-004 | Purchase orders: draft → sent → partially received → received / cancelled; receipt against PO lines. | P2 | P · Q-I04 |
| FR-PUR-005 | Purchase returns to supplier, creating purchase-return movements at the cost originally received (or current average — ADR-006). | MVP | P |
| FR-PUR-006 | Additional landed costs on a receipt (transport, offloading) apportioned to line costs. | TBC | Q-I05 |
| FR-PUR-007 | Record what is owed to suppliers and payments made (supplier balances / payables). | TBC | Q-F02 |
| FR-PUR-008 | Last purchase cost and supplier shown when receiving and when pricing. | MVP | P |

## SAL — Sales & POS

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-SAL-001 | POS screen usable on desktop (keyboard + scanner) and phone (touch + camera scan) at ≥ 360 px width. | MVP | C (req. 1, 2) |
| FR-SAL-002 | Add items by barcode scan, SKU, or name search; select variant and unit; edit quantity. | MVP | P |
| FR-SAL-003 | Camera barcode scanning on phones. | MVP | P |
| FR-SAL-004 | Show available stock at the current location when adding an item. | MVP | P |
| FR-SAL-005 | Cart totals: subtotal, discounts, tax, rounding, total; tax-inclusive or exclusive per settings. | MVP | P |
| FR-SAL-006 | Split payment across multiple methods (e.g. part cash, part transfer); compute change for cash. | MVP | P |
| FR-SAL-007 | Capture payment references for transfer/card payments where the method requires it. | MVP | P |
| FR-SAL-008 | Hold/park a sale and resume it later on the same location. | MVP | P |
| FR-SAL-009 | Complete a sale atomically: sale, lines, payments, stock movements, cash session totals, and a `sale.completed` business event in one database transaction. | MVP | P |
| FR-SAL-010 | Each sale line stores: entered unit and factor, base quantity, list price, charged price, discount, tax rate and amount, average unit cost at time of sale. | MVP | C/P |
| FR-SAL-011 | Receipt: print to thermal printer (58/80 mm) via browser print, and share as PDF/image/link. | MVP (print, PDF) / TBC (WhatsApp, SMS) | Q-S06 |
| FR-SAL-012 | Attach an optional customer to a sale; required for credit sales. | MVP | P |
| FR-SAL-013 | Sales on credit (customer pays later), respecting customer credit limit. | MVP | Q-F01 |
| FR-SAL-014 | Invoices / pro-forma quotes for larger or wholesale customers. | Later | Q-S02 |
| FR-SAL-015 | Reprint any past receipt (marked "copy"). | MVP | P |
| FR-SAL-016 | Sales history searchable by number, date, cashier, customer, location, payment method. | MVP | P |
| FR-SAL-017 | Integration with card/POS terminals or payment gateways to confirm payments automatically. | P5 · TBC | Q-S07 |

## RET — Returns, refunds & voids

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-RET-001 | Void a completed sale (same day / open session only, configurable) with reason and permission; creates reversing movements and payments; original sale remains, marked voided. | Out — doc 12 Q3 | P · Q-S03 |
| FR-RET-002 | Return items against an original sale (full or partial), limited to quantities sold minus already returned. | Out | P |
| FR-RET-003 | Choose per returned line whether stock goes back to sellable stock or is written off (damaged). | Out | P |
| FR-RET-004 | Refund by original method, cash, or store credit [TBC]; refunds over a threshold need approval. | Out | Q-S03 |
| FR-RET-005 | Exchange (return + new sale in one flow). | Out | P |
| FR-RET-006 | Return without receipt. | Out | Q-S03 |

## CSH — Cash sessions & payments

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-CSH-001 | Open a cash session per device/cashier with an opening float; sales on that device attach to the open session. | MVP | P · Q-S08 |
| FR-CSH-002 | Record pay-ins and pay-outs (e.g. petty cash) with reason during a session. | MVP | P |
| FR-CSH-003 | Close a session: system computes expected cash by method; cashier enters counted cash (optionally by denomination); variance stored. | MVP | P |
| FR-CSH-004 | Blind close option (cashier does not see the expected amount before counting). | MVP | P |
| FR-CSH-005 | Manager reviews/reconciles closed sessions; variance report by cashier. | MVP | P |
| FR-CSH-006 | End-of-day summary per location: sales by method, refunds, pay-outs, expected vs counted. | MVP | P |

## CUS — Customers & receivables

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-CUS-001 | Customer records: name, phone, email, address, notes, assigned price list. | MVP | P |
| FR-CUS-002 | Quick-add customer from POS with name + phone. | MVP | P |
| FR-CUS-003 | Customer purchase history. | MVP | P |
| FR-CUS-004 | Customer account ledger (credit sales, payments, refunds, adjustments) with running balance and credit limit. | MVP | Q-F01 |
| FR-CUS-005 | Receive customer payments and allocate to outstanding sales; print statement. | MVP | Q-F01 |
| FR-CUS-006 | Loyalty points. | P5 | P |
| FR-CUS-007 | Customer consent flag for marketing messages. | P2 | P (data protection) |

## EXP — Expenses (optional "Finance" module)

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-EXP-001 | Expense categories (e.g. rent, fuel/diesel, salaries, transport, utilities). | P3 | P · Q-F04 |
| FR-EXP-002 | Record expenses: date, location, category, amount, payment method, payee, description, receipt photo. | P3 | P |
| FR-EXP-003 | Cash expenses paid from the till link to the cash session as a pay-out. | P3 | P |
| FR-EXP-004 | Expense approval above a threshold. | P3 | P |
| FR-EXP-005 | Simple profit report: sales − cost of goods sold − expenses for a period. | P3 | P |

## ACC — Accounting (optional module)

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-ACC-001 | Chart of accounts per business, seeded from a template; accounts typed asset/liability/equity/income/expense. | P3 | C (req. 6) |
| FR-ACC-002 | Account mappings: which accounts to use for sales revenue, inventory, cost of sales, tax payable, cash/bank per payment method, receivables, payables, inventory loss, etc. | P3 | P |
| FR-ACC-003 | Automatic double-entry journals from business events (sale completed, sale voided, return, goods received, purchase return, adjustment, expense, customer/supplier payment). | P3 | P |
| FR-ACC-004 | Journals must balance (total debit = total credit) and are immutable once posted; corrections by reversal. | P3 | P |
| FR-ACC-005 | Manual journal entries with permission. | P3 | P |
| FR-ACC-006 | Fiscal periods; closed periods reject new postings. | P3 | P |
| FR-ACC-007 | Reports: general ledger, trial balance, profit & loss, balance sheet. | P3 | P |
| FR-ACC-008 | Event-processing status: events pending, posted, failed (with reason), and retry. | P3 | P |
| FR-ACC-009 | On enabling: choose a start date; post opening balances; optionally back-post events from that date. | P3 | P · ADR-005 |
| FR-ACC-010 | On disabling: stop posting; keep accounting data read-only; events continue to be recorded for later catch-up. | P3 | C (req. 7) / P |
| FR-ACC-011 | Export to external accounting software (CSV or integration). | P5 | P |

## RPT — Reporting & dashboards

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-RPT-001 | Dashboard: today's sales, transactions, average basket, sales by payment method, top items, low-stock count; filter by location. | MVP | P |
| FR-RPT-002 | Sales reports by period, location, cashier, category, product/variant, payment method. | MVP | P |
| FR-RPT-003 | Gross margin report (revenue − cost snapshot) by product/category; visible only with cost permission. | MVP | P |
| FR-RPT-004 | Stock on hand, valuation, low stock, stock movement history, adjustments/write-offs summary. | MVP | P |
| FR-RPT-005 | Expiring stock report. | Out | Q-C02 |
| FR-RPT-006 | Cash session and variance reports. | MVP | P |
| FR-RPT-007 | Export any report to CSV; print-friendly view. | MVP (CSV) / P2 (PDF) | P |
| FR-RPT-008 | All report dates are interpreted in the business's time zone. | MVP | P |

## AUD — Audit & activity

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-AUD-001 | Audit log of sensitive actions: sign-in, role/permission changes, settings changes, price changes, voids, refunds, overrides, adjustments, module enable/disable, deletions/archives. | MVP | P |
| FR-AUD-002 | Each entry stores actor, business, action, entity, before/after values (where applicable), time, device/IP. | MVP | P |
| FR-AUD-003 | Audit log is append-only and viewable by owners (and platform admins for support). | MVP | P |

## OFF — Offline operation

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-OFF-001 | Installable PWA (home-screen icon, standalone window), app shell cached for fast start. | MVP | C (req. 2) |
| FR-OFF-002 | Clear online/offline indicator and last-sync time. | MVP | P |
| FR-OFF-003 | Continue completing cash sales while offline using a cached catalogue and prices for the device's location; queue sales locally and sync automatically when back online. | TBC (doc 12 Q1) | Q-T01 |
| FR-OFF-004 | Offline sales are idempotent on sync (each has a device-generated ID); duplicates are ignored. | TBC (doc 12 Q1) | P |
| FR-OFF-005 | Conflicts on sync (insufficient stock, deactivated product, closed session) are accepted and flagged for review rather than rejected, so recorded sales are never lost. | TBC (doc 12 Q1) | P · Q-I01 |
| FR-OFF-006 | Back-office functions (receiving, counts, adjustments, settings) require connectivity. | MVP | P |

## IMP — Import / export

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-IMP-001 | Import products, variants, prices and barcodes from CSV/XLSX with validation preview and error report. | P2 (optional) | P · Q-M01 |
| FR-IMP-002 | Import opening stock per location. | P2 (optional) | P |
| FR-IMP-003 | Import customers and suppliers. | P2 | P |
| FR-IMP-004 | Full business data export (for portability/backup). | P2 | P |

## NTF — Notifications

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-NTF-001 | In-app alerts: low stock, negative stock, offline sync conflicts, large variances, pending approvals. | P2 | P |
| FR-NTF-002 | Daily summary to the owner by email. | P2 | P |
| FR-NTF-003 | WhatsApp/SMS notifications. | TBC | Q-S06 |
