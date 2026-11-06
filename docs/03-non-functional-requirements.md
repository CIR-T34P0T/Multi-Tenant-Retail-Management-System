# 03 — Non-Functional Requirements

Status: Draft v0.1 · 6 November 2026

IDs are `NFR-<AREA>-<NNN>`. Numeric targets are **[Proposed]** starting points; they need the owner's agreement and should be validated in Phase 0 with real devices and connections in the pilot's location.

---

## 1. Platform & compatibility (CMP)

| ID | Requirement |
|---|---|
| NFR-CMP-001 | Responsive layout from 360 px (small Android phone) to 1920 px desktop. POS and stock screens are designed mobile-first. |
| NFR-CMP-002 | Supported browsers: current and previous major versions of Chrome (Android, Windows, macOS), Edge, Samsung Internet; Safari on iOS/macOS with documented PWA limitations. |
| NFR-CMP-003 | Installable as a PWA (web app manifest, service worker, icons, standalone display). |
| NFR-CMP-004 | Usable on a mid-range Android phone (approx. 3–4 GB RAM) without noticeable lag on POS. Test device list to be agreed (Q-T03). |
| NFR-CMP-005 | Keyboard-wedge barcode scanners work on any text-focused POS field without configuration. |
| NFR-CMP-006 | Receipt layout prints correctly on 58 mm and 80 mm thermal printers via the browser print dialog. |

## 2. Performance (PRF)

| ID | Requirement |
|---|---|
| NFR-PRF-001 | POS product lookup by barcode returns in ≤ 300 ms (p95) when the catalogue is cached on the device; ≤ 800 ms online uncached. |
| NFR-PRF-002 | Completing a sale (online) returns confirmation in ≤ 1.5 s (p95) on a 3G-class connection. |
| NFR-PRF-003 | First load of the installed PWA shell ≤ 3 s on a mid-range phone; subsequent loads ≤ 1.5 s. |
| NFR-PRF-004 | Initial JavaScript for POS route ≤ 250 KB compressed (budget enforced in CI). |
| NFR-PRF-005 | Standard reports for one location and one month return in ≤ 5 s at the scale in NFR-SCL-001. |
| NFR-PRF-006 | List screens paginate server-side; no screen loads unbounded rows. |

## 3. Scalability (SCL)

[Proposed design envelope — the pilot's real volumes are unknown (Q-B03)]

| ID | Requirement |
|---|---|
| NFR-SCL-001 | Per business: up to 20 locations, 50,000 variants, 2,000 sales/day, 5 years of history without redesign. |
| NFR-SCL-002 | Platform: up to 500 businesses on a single database before revisiting tenancy strategy (e.g. sharding or dedicated databases for large tenants). |
| NFR-SCL-003 | Every tenant table is indexed with `business_id` as the leading column of its main access indexes. |
| NFR-SCL-004 | Large append-only tables (stock movements, audit logs, business events) are designed so they can later be partitioned by time without application changes. |

## 4. Availability & resilience (AVL)

| ID | Requirement |
|---|---|
| NFR-AVL-001 | Target service availability 99.5% monthly for online functions (excluding provider-wide outages). |
| NFR-AVL-002 | Loss of connectivity must not lose a recorded sale. If offline POS is in scope (Q-T01), the device can sell for at least 8 hours offline and hold at least 500 queued sales. |
| NFR-AVL-003 | Sync after reconnection completes automatically; queued sales sync in order within 2 minutes of reconnecting for a typical queue (≤ 100 sales). |
| NFR-AVL-004 | Failures in optional modules (e.g. accounting posting) never block or roll back operational transactions. |

## 5. Data integrity & correctness (INT)

| ID | Requirement |
|---|---|
| NFR-INT-001 | All operational postings (sale, return, void, receipt, transfer, adjustment, count) execute in a single database transaction: all records or none. |
| NFR-INT-002 | Money is stored as fixed-point decimal (`numeric(18,2)`), quantities as `numeric(18,4)`, costs as `numeric(18,4)`. No floating-point arithmetic for money or quantities in client or server; the TypeScript side uses a decimal library and exchanges decimals as strings. |
| NFR-INT-003 | Stock movement, journal and audit tables are append-only, enforced by database triggers/permissions, not only application code. |
| NFR-INT-004 | Every stock level equals the sum of its movements; a scheduled reconciliation job verifies this nightly and alerts on mismatch. |
| NFR-INT-005 | Every posted journal balances; enforced by a deferred database constraint. |
| NFR-INT-006 | Concurrent sales of the same item do not corrupt stock: stock rows are updated with row-level locking inside the posting transaction. |
| NFR-INT-007 | All write APIs that can be retried accept an idempotency key (client-generated UUID) and are safe to repeat. |
| NFR-INT-008 | Server recomputes prices, taxes and totals; client-sent totals are verified, never trusted. Differences beyond tolerance are rejected (online) or flagged (offline sync). |
| NFR-INT-009 | All timestamps stored as `timestamptz` (UTC); business dates computed in the business's time zone. |

## 6. Security (SEC)

| ID | Requirement |
|---|---|
| NFR-SEC-001 | Tenant isolation enforced by PostgreSQL Row-Level Security on every tenant table; RLS enabled by default, verified by automated tests that attempt cross-tenant reads and writes. |
| NFR-SEC-002 | The Supabase service-role key is used only in server-side code and never shipped to the browser. |
| NFR-SEC-003 | Ledger-writing operations are only possible through vetted database functions; clients have no direct INSERT/UPDATE on ledger tables. |
| NFR-SEC-004 | Permission checks are applied at three layers: UI (hide), server (reject), database (RLS/function checks). The database layer is authoritative. |
| NFR-SEC-005 | Passwords handled only by Supabase Auth; minimum length 10; rate limiting on sign-in and OTP. |
| NFR-SEC-006 | TLS everywhere; HSTS; secure, HTTP-only cookies for sessions; CSRF protection on mutations. |
| NFR-SEC-007 | Content Security Policy and standard security headers. |
| NFR-SEC-008 | File uploads (images, receipts) stored in business-scoped storage paths with storage policies; type and size validated (images ≤ 5 MB). |
| NFR-SEC-009 | Dependencies scanned in CI; critical vulnerabilities block release. |
| NFR-SEC-010 | Platform-admin access to tenant data is logged with reason (FR-PLT-009). |
| NFR-SEC-011 | Offline data on devices (cached catalogue, queued sales) contains no passwords or secrets; cost prices are excluded from the cache for roles without cost permission. Signing out clears local data. |

## 7. Privacy & compliance (PRV)

| ID | Requirement |
|---|---|
| NFR-PRV-001 | Collect only personal data needed (customer name/phone, staff contact). |
| NFR-PRV-002 | Support the business's obligations under the Nigeria Data Protection Act 2023 (and GDPR if EU tenants are added): access, correction, deletion/anonymisation of customer records on request, without breaking transaction history (anonymise, don't delete). Legal confirmation required (Q-L01). |
| NFR-PRV-003 | Data hosting region chosen and documented; cross-border transfer implications reviewed (Q-L02). |
| NFR-PRV-004 | Tax calculations configurable (rates, inclusive/exclusive); no tax rate is hard-coded. Current VAT status and rate of the pilot business to be confirmed with its accountant (Q-F03). |
| NFR-PRV-005 | Financial and stock records retained for a configurable period (default: indefinitely while the account is active); retention rules confirmed with the business's accountant (Q-L03). |

## 8. Auditability (AUDN)

| ID | Requirement |
|---|---|
| NFR-AUDN-001 | Every transactional record stores `created_by`, `created_at`; postable documents also store `posted_by`, `posted_at`. |
| NFR-AUDN-002 | Every stock movement and journal line can be traced to its source document and line. |
| NFR-AUDN-003 | Audit entries cannot be modified or deleted by any tenant user. |

## 9. Backup & recovery (BCK)

| ID | Requirement |
|---|---|
| NFR-BCK-001 | Self-hosted (ADR-009): continuous WAL archiving + nightly base backups to off-site storage, enabling point-in-time recovery; backup success monitored. |
| NFR-BCK-002 | Recovery Point Objective (RPO) ≤ 15 minutes; Recovery Time Objective (RTO) ≤ 4 hours. [Proposed] |
| NFR-BCK-003 | Restore procedure documented and tested at least once before go-live and quarterly after. |
| NFR-BCK-004 | Storage bucket (images, receipts) backed up or replicated. |

## 10. Usability & accessibility (USE)

| ID | Requirement |
|---|---|
| NFR-USE-001 | A new cashier can complete a cash sale after ≤ 15 minutes of training. |
| NFR-USE-002 | Touch targets ≥ 44 × 44 px on mobile; POS operable one-handed on a phone. |
| NFR-USE-003 | WCAG 2.2 AA for colour contrast, focus states, labels and keyboard navigation. |
| NFR-USE-004 | Money displayed with currency symbol and thousands separators (e.g. ₦12,500.00); quantities show their unit. |
| NFR-USE-005 | Destructive or financial actions require confirmation and show what will happen. |
| NFR-USE-006 | Works in bright shop lighting (high-contrast theme) — light and dark themes provided. |

## 11. Internationalisation (I18N)

| ID | Requirement |
|---|---|
| NFR-I18N-001 | All UI strings externalised; English at launch. Additional languages (e.g. Hausa, Yoruba, Igbo, French, Italian) addable without code changes to components. Which languages, if any, is TBC (Q-U04). |
| NFR-I18N-002 | Currency, number and date formats driven by business locale settings. |
| NFR-I18N-003 | Schema carries a currency code per business so non-NGN businesses can be onboarded. |

## 12. Maintainability & extensibility (MNT)

| ID | Requirement |
|---|---|
| NFR-MNT-001 | Modular codebase: each module owns its routes, UI, server actions, database migrations, permissions and event handlers; modules interact through published interfaces and events, never by reaching into each other's tables for writes. |
| NFR-MNT-002 | No operational module may import from or depend on Accounting or Expenses (checked by a lint rule on import boundaries). |
| NFR-MNT-003 | All schema changes via versioned migrations in source control; generated TypeScript database types are kept in sync. |
| NFR-MNT-004 | Strict TypeScript; input validation with shared schemas (e.g. Zod) used by forms and server actions. |
| NFR-MNT-005 | Architecture Decision Records kept in `/docs/adr`. |

## 13. Testing & quality (TST)

| ID | Requirement |
|---|---|
| NFR-TST-001 | Database tests (e.g. pgTAP) for RLS isolation, posting functions, stock-level maintenance and journal balancing. |
| NFR-TST-002 | Unit tests for pricing, unit conversion, tax, rounding and costing logic. |
| NFR-TST-003 | End-to-end tests (e.g. Playwright) for the core flows in doc 09, run on desktop and mobile viewports. |
| NFR-TST-004 | The operational test suite runs with Accounting **enabled and disabled**; both must pass (proves FR-CFG-004). |
| NFR-TST-005 | Offline sync tests: duplicate submission, out-of-order sync, conflict scenarios. |

## 14. Observability & operations (OBS)

| ID | Requirement |
|---|---|
| NFR-OBS-001 | Client and server error tracking with release tagging; no personal data in error payloads. |
| NFR-OBS-002 | Structured server logs with request ID, business ID and user ID. |
| NFR-OBS-003 | Health checks and alerts for: failed event processing, stock reconciliation mismatch, offline queues not syncing for > 24 h, backup failures. |
| NFR-OBS-004 | Separate environments: local, staging, production; production data never copied to lower environments unanonymised. |

## 15. Cost (CST)

| ID | Requirement |
|---|---|
| NFR-CST-001 | Running cost for the pilot should stay within a monthly budget to be agreed (Q-P02). Architecture avoids services that are expensive at low scale. |
| NFR-CST-002 | SMS/WhatsApp messages and OTPs are metered; usage is capped per business and visible to the owner. |
