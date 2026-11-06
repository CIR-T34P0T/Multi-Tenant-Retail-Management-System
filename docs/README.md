# Retail Business Management System — Design Documentation

**Status:** v0.3 — Stage 1 complete, awaiting approval (defaults accepted; reconciled with the Prompt Collection — see doc 12) · 6 November 2026 · **Implementation not started — awaiting approval.**

A configurable, multi-business retail management PWA (Next.js, TypeScript, Supabase/PostgreSQL, Tailwind CSS, shadcn/ui), first serving a Nigerian retailer of groceries, frozen foods, drinks & household products, Islamic clothing (including Jalab) and other clothing & accessories.

## Documents

| # | Document | What it answers |
|---|---|---|
| 01 | [Product Requirements Document](01-product-requirements-document.md) | Why, for whom, goals, scope, principles, success metrics |
| 02 | [Functional Requirements](02-functional-requirements.md) | What the system must do — numbered, prioritised `FR-*` |
| 03 | [Non-Functional Requirements](03-non-functional-requirements.md) | How well — performance, security, integrity, offline, backups `NFR-*` |
| 04 | [System Architecture](04-system-architecture.md) | Stack, layers, tenancy, module system, event outbox, inventory engine, offline POS |
| 05 | [Entity Relationship Diagram](05-entity-relationship-diagram.md) | Data model in six Mermaid ER diagrams |
| 06 | [Database Schema](06-database-schema.md) | Table-by-table DDL, constraints, RLS pattern, posting functions, indexes |
| 07 | [Module Dependency Map](07-module-dependency-map.md) | Module graph, register, and why accounting can be switched off safely |
| 08 | [User Roles & Permissions](08-user-roles-and-permissions.md) | Permission catalogue, default roles, matrix, overrides, location scoping |
| 09 | [Business Workflows](09-business-workflows.md) | 20 workflows from onboarding to stocktake, returns, cash-up, accounting |
| 10 | [MVP Scope & Roadmap](10-mvp-scope-and-roadmap.md) | MVP in/out, acceptance criteria, Phases 0–5 |
| 11 | [Open Questions, Risks & Decisions](11-open-questions-risks-decisions.md) | Full question list, risks, ADRs |
| 12 | [Decision Log](12-decision-log.md) | **Start here** — answers, defaults, reconciliation with the Prompt Collection |
| 13 | [Testing Strategy](13-testing-strategy.md) | Test levels, tools, critical scenarios, stage gates |
| 14 | [Security Model](14-security-model.md) | Threats, isolation, authorization layers, secrets, self-hosted hardening |

## Mapping to the Prompt Collection's file names

| Prompt Collection | This pack |
|---|---|
| PRD.md | 01 |
| FUNCTIONAL_REQUIREMENTS.md | 02 |
| NON_FUNCTIONAL_REQUIREMENTS.md | 03 |
| SYSTEM_ARCHITECTURE.md | 04 |
| DATABASE_SCHEMA.md | 05 + 06 |
| MODULE_DEPENDENCIES.md | 07 |
| USER_ROLES_AND_PERMISSIONS.md | 08 |
| USER_WORKFLOWS.md | 09 |
| DEVELOPMENT_ROADMAP.md | 10 |
| TESTING_STRATEGY.md | 13 |
| SECURITY_MODEL.md | 14 |

## Labels used throughout

- **[Confirmed]** — stated in the brief.
- **[Proposed]** — design recommendation needing approval.
- **[TBC] / Q-xxx** — depends on an open question; not to be built until answered.
- **ADR-nnn** — architectural decision listed in doc 11 §3.

## Key design choices at a glance

1. **One database, many businesses**, isolated by `business_id` + PostgreSQL Row-Level Security + same-business composite foreign keys.
2. **Every product has variants**; stock, SKU, barcode and price live on the variant. Categories declare typed attributes; some attributes are variant axes (e.g. Size × Colour).
3. **Units of measure per product** with conversion factors; stock always in base units; transactions keep the unit and factor used.
4. **Effective-dated prices**; sales snapshot price, tax and cost so history never changes.
5. **Append-only stock ledger** (`stock_movements`) with cached balances updated in the same transaction by a single database function.
6. **Accounting and expenses are optional modules** fed by a transactional event outbox; operations never call or depend on them.
7. **Self-hosted** Supabase + Next.js on Docker with off-site backups.
8. **Pilot scope:** one shop, owner-set fixed prices, credit sales, negative stock allowed with warning, no returns/voids, no tax, no batches.
9. **Hierarchy:** Business → Sections → Categories → Products → Variants. Sales, purchases, suppliers, customers, credit, expenses, accounting are optional modules.
10. **First release is online-only**; offline selling is a later stage.

## Next step

Approve v0.3 (especially the reconciliation table in doc 12 §5). Implementation then starts with **Stage 2 — Project initialization and foundation**.
