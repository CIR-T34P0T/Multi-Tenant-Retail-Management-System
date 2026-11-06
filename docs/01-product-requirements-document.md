# 01 — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Retail Business Management System (working name: **RBMS**) |
| **Document status** | Draft v0.1 — awaiting owner approval |
| **Date** | 6 November 2026 |
| **Pilot customer** | A Nigerian retail business (name TBC) |
| **Related docs** | 02 Functional, 03 Non-functional, 04 Architecture, 11 Open questions |

> **Reading convention.** Statements marked **[Confirmed]** come directly from the owner's brief. Statements marked **[Proposed]** are design recommendations that need approval. Statements marked **[TBC]** depend on an open question in `11-open-questions-risks-decisions.md` and must not be built until answered.

---

## 1. Purpose

RBMS is a configurable, multi-business retail management application delivered as a responsive Progressive Web App (PWA). It lets a retail business sell, buy, and track stock with full traceability, and optionally run expenses and double-entry accounting on top of the same data.

It is built first for one Nigerian retailer, but is designed as a **reusable product**: a second retailer with a different product mix must be onboardable by **configuration and seed templates**, not by rebuilding the application. [Confirmed]

It is intended for **real business use**, not as a visual prototype. [Confirmed] That means data integrity, auditability, security and recoverability are first-class requirements, not later polish.

## 2. Background and problem

The pilot business sells across five quite different product families [Confirmed]:

| # | Product family | Characteristics that matter to the system |
|---|---|---|
| 1 | Groceries and provisions | Many SKUs, multiple pack sizes (piece / pack / carton), barcodes, frequent price changes. Possibly expiry dates [TBC]. |
| 2 | Frozen foods | Possibly sold by weight [TBC]; perishable, expiry and spoilage write-offs likely [TBC]. |
| 3 | Drinks and household products | Pack/crate units; possibly returnable bottles or crate deposits [TBC]. |
| 4 | Islamic clothing, including Jalab | Variants by size, colour and possibly fabric/length [TBC]; ready-made vs made-to-measure unknown [TBC]. |
| 5 | Other clothing and accessories | Variants by size/colour; seasonal stock. |

Mixing these in one shop means the system cannot hard-code a single product model. It needs configurable categories, configurable attributes, product variants, multiple units of measure per product, and price changes over time — while still giving one consistent stock ledger. [Confirmed — requirements 5, 8, 9]

## 3. Goals

| ID | Goal | Source |
|---|---|---|
| G1 | Run day-to-day retail operations: selling, purchasing/receiving, stock control. | Confirmed |
| G2 | Work on desktop and mobile as a responsive PWA. | Confirmed (req. 1, 2) |
| G3 | Host multiple independent businesses with fully isolated data, users, products, inventory and transactions. | Confirmed (req. 3, 4) |
| G4 | Let each business define its own categories and product attributes. | Confirmed (req. 5) |
| G5 | Support units of measure, product variants and price changes over time. | Confirmed (req. 8) |
| G6 | Record every inventory change as a traceable movement. | Confirmed (req. 9) |
| G7 | Offer accounting and financial management as optional modules that never block operations. | Confirmed (req. 6, 7) |
| G8 | Be extensible for future modules and other retail types. | Confirmed (req. 10) |

## 4. Non-goals (for this product generation)

[Proposed — confirm in review]

- Not a restaurant, pharmacy-dispensing, manufacturing or rental system. Those need workflows (table orders, prescriptions, bills of materials, bookings) that configuration alone should not be expected to cover. The architecture leaves room to add them as modules later.
- Not a payroll or HR system.
- Not a statutory tax-filing product. It records tax on transactions; filing stays with the business's accountant.
- Not an e-commerce storefront in the first releases (possible integration later).
- No native iOS/Android apps in the first releases; the PWA is the mobile client.

## 5. Users and personas

Personas below are generic retail roles. **The pilot business's actual staffing, branch count and who does what are not yet known [TBC — Q-B01..Q-B04].**

| Persona | Primary device | Core needs |
|---|---|---|
| **Business owner** | Phone, sometimes laptop | See sales, stock and cash at a glance; approve sensitive actions; control prices and staff access; may be remote from the shop. |
| **Store / branch manager** | Desktop or tablet | Receive stock, run stock counts, manage prices, close the day, handle returns and exceptions. |
| **Cashier / sales attendant** | Desktop POS or phone | Ring up sales fast, find products by name or barcode, take mixed payments, print/share receipts. |
| **Inventory / store keeper** | Phone | Receive goods, transfer stock, record damage/expiry, count stock. |
| **Accountant / bookkeeper** (optional module) | Desktop | Expenses, chart of accounts, journals, financial statements. |
| **Platform administrator** (us) | Desktop | Create and support businesses, manage templates and modules, never browse tenant data without an audited reason. |

## 6. Product principles

[Proposed]

1. **Operations never wait on finance.** Selling, receiving and stock control work identically whether accounting is on or off.
2. **Ledgers are append-only.** Stock and money ledgers are never edited in place; corrections are new, reversing records.
3. **Configuration over code — within limits.** Categories, attributes, units, price lists, roles, tax rates, payment methods, document numbering and receipt text are configuration. New *workflows* are modules.
4. **Isolation by default.** Every tenant row is scoped to one business and protected at the database layer, not only in the UI.
5. **Mobile-first, low-bandwidth friendly.** Usable on a mid-range Android phone on a weak connection.
6. **Snapshot what was true.** Sales and receipts store the price, cost, tax rate and unit conversion that applied at the time, so history never changes when settings change.

## 7. Scope overview (capability map)

| Capability area | Description | MVP? |
|---|---|---|
| Platform & tenancy | Businesses, locations (shops/warehouses), membership, business switching | MVP |
| Identity & access | Sign-in, invitations, roles, permissions, location scoping | MVP |
| Configuration & modules | Business settings, module enable/disable, document numbering, templates | MVP |
| Catalogue | Categories, attributes, products, variants, units, barcodes, images | MVP |
| Pricing | Price lists, effective-dated prices, price history, bulk updates | MVP (bulk tools: Proposed) |
| Inventory | Movement ledger, stock levels, adjustments, transfers, stock counts, batches/expiry (optional per product) | MVP (batches: TBC) |
| Purchasing | Suppliers, goods receipts; purchase orders optional | MVP (POs: Later/TBC) |
| Sales / POS | Cart, barcode, mixed payments, receipts, holds, voids, returns | MVP |
| Cash management | Till sessions (open/close), pay-ins/outs, variance | MVP [Proposed] |
| Customers | Customer records; credit sales and receivables | Records: MVP; credit: TBC |
| Reporting | Sales, stock, valuation, low stock, expiry, margin, cash-up | MVP (core set) |
| Expenses (Finance-lite) | Operating expenses, categories, receipts | Optional module, Phase 3 |
| Accounting | Chart of accounts, automated journals, trial balance, P&L, balance sheet | Optional module, Phase 3 |
| Offline POS | Continue selling during connectivity loss, sync later | TBC — see Q-T01 |
| Integrations | Payment terminals, WhatsApp/SMS receipts, e-commerce, accounting export | Later |

## 8. Key capabilities (summary)

Detailed, testable statements are in `02-functional-requirements.md`.

### 8.1 Multi-business tenancy
One deployment serves many businesses. A user may belong to more than one business with different roles in each and switches between them explicitly. All data is isolated per business, enforced by PostgreSQL Row-Level Security (RLS). [Confirmed requirement; enforcement approach Proposed]

### 8.2 Configurable catalogue
Businesses define a category tree; each category declares which attributes apply (e.g. *Jalab → Size, Colour, Fabric*; *Frozen → Storage temperature*). Attributes have types (text, number, yes/no, date, single-select, multi-select). Attributes flagged as **variant axes** generate sellable variants (e.g. Size × Colour). [Confirmed requirement; design Proposed]

### 8.3 Units of measure
Every product has a **base unit** in which stock is counted. Products may be bought and sold in other units with a conversion factor (e.g. 1 carton = 24 pieces; or kg with decimals for weighed goods). [Confirmed requirement; design Proposed]

### 8.4 Prices that change over time
Prices are effective-dated per variant, unit and price list (e.g. *Retail*, *Wholesale* [TBC]). Changing a price creates a new price record; the old one is kept for history. Each sale stores the price actually charged. [Confirmed requirement; design Proposed]

### 8.5 Traceable inventory
Every change in stock is a **stock movement** with type, quantity, location, cost, user, time and source document. Current stock is derived from movements and cached for speed. Nothing changes stock without a movement. [Confirmed]

### 8.6 Optional accounting
Accounting subscribes to business events (sale completed, goods received, etc.) and posts journals asynchronously. Turning it off stops posting only; operations continue unchanged. [Confirmed requirement; event-driven design Proposed]

## 9. Success metrics

[Proposed — targets need owner agreement; baseline for the pilot is unknown]

| Metric | Proposed target |
|---|---|
| POS checkout time (5-item cart, barcode) | ≤ 30 seconds end-to-end |
| Stock accuracy at stock count | ≥ 98% of SKUs within tolerance after 3 months |
| Sales lost to system downtime | 0 (requires offline POS — Q-T01) |
| Unexplained stock movements | 0 (every movement has source and user) |
| Daily cash-up variance visibility | 100% of sessions closed with counted cash |
| Time to onboard a second, different retailer | ≤ 1 day of configuration, 0 code changes |

## 10. Assumptions

[Proposed — each must be confirmed or corrected]

- A1. Single currency per business; Nigerian Naira (NGN) for the pilot.
- A2. Business time zone *Africa/Lagos* for the pilot; stored per business.
- A3. English user interface at launch; text externalised so other languages can be added.
- A4. Staff have smartphones or a shared POS computer with a modern Chromium-based browser.
- A5. Internet is available most of the time but can be unreliable; power outages occur.
- A6. Barcode scanners, if used, behave as USB/Bluetooth keyboards.
- A7. Receipt printing via the browser print dialog to a thermal printer is acceptable for MVP.
- A8. The pilot will be the only tenant during MVP; self-service sign-up and subscription billing are later phases.

## 11. Constraints

- Technology: Next.js, TypeScript, Supabase (PostgreSQL, Auth, Storage), Tailwind CSS, shadcn/ui. [Confirmed preference]
- PWA platform limits, notably on iOS Safari (e.g. no Background Sync API), constrain offline behaviour on iPhones. [Known constraint]
- Data protection: the Nigeria Data Protection Act 2023 is likely to apply to customer and staff personal data; obligations should be confirmed with counsel. If EU businesses are later onboarded, GDPR applies. [Proposed]

## 12. Dependencies

- Supabase project(s) and hosting for the Next.js app (provider TBC — ADR-009).
- Domain name and TLS.
- Pilot business availability for discovery, data migration (existing product list, opening stock) and user acceptance testing.

## 13. Release strategy

[Proposed] Phase 0 foundations → Phase 1 MVP for the pilot → Phase 2 pilot hardening (offline POS if not in MVP, purchasing extras) → Phase 3 Finance & Accounting modules → Phase 4 productisation for other retailers → Phase 5 integrations. Details in `10-mvp-scope-and-roadmap.md`.

## 14. Glossary

| Term | Meaning |
|---|---|
| **Business (tenant)** | An independent customer organisation with isolated data. |
| **Location** | A shop, warehouse or other place that holds stock, belonging to one business. |
| **Product** | A catalogue item (e.g. "Men's Jalab — Premium Cotton"). |
| **Variant** | The stock-keeping, sellable form of a product (e.g. "White / L"). Every product has at least one. |
| **SKU** | Unique stock-keeping code of a variant within a business. |
| **Base unit** | The unit in which a product's stock is counted (e.g. piece, kg). |
| **Stock movement** | An immutable record of a quantity entering or leaving a location. |
| **Price list** | A named set of prices (e.g. Retail, Wholesale). |
| **Till / cash session** | A cashier's shift on a device, from opening float to closing count. |
| **Module** | A switchable functional area (e.g. Accounting). |
| **Business event** | A record that something happened (e.g. `sale.completed`), consumed by optional modules. |
