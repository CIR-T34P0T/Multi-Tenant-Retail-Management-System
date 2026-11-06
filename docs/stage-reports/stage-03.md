# Stage 3 — Database foundation and multi-tenant security: completion report

Date: 6 November 2026 · Status: **complete, awaiting owner approval**

## Objective

Create the database foundation — businesses, profiles, members, roles and permissions, settings, modules, audit logging — protected by Row-Level Security, and prove that one business can never read or change another's data, including by tampering with IDs.

## What was created

| Area | Files |
|---|---|
| 5 database migrations | `supabase/migrations/2026110610*.sql` — explained one by one in `docs/database/README.md` |
| 12 tables | `businesses`, `profiles`, `business_members`, `roles`, `role_permissions`, `business_settings`, `business_modules`, `audit_logs`, and reference tables `modules`, `permissions`, `role_templates`, `role_template_permissions` |
| Reference data | 13 modules, 48 permissions, 3 role templates (Owner, Manager, Attendant) |
| Security | RLS on every table; helper checks for membership, owner, permission, module; exact table privileges; signed-out visitors locked out entirely |
| Functions users can call | `create_business()`, `set_module_enabled()`, `current_user_permissions()` |
| Guard rules | No self-promotion; only owners grant ownership; no assigning or granting permissions you don't hold; owner role locked; always one active owner |
| Audit log | Automatic record of who changed businesses, settings, modules, roles, permissions and members (before and after); nobody can edit or delete it |
| App side | `src/lib/authz/permissions.ts` (permission list), `src/lib/authz/server.ts` (`requirePermission`, `requireMembership`) |
| Tests | 6 pgTAP files (`supabase/tests/database/`), local runner `scripts/db/test-local.sh`, unit tests for the server helpers and for database ↔ TypeScript consistency |
| CI | New `database` job: starts real Supabase, applies migrations, runs the database tests |
| Docs | `docs/database/README.md` |

## Tests and results (actually run)

| Check | Where | Result |
|---|---|---|
| Database tests (pgTAP) | My workspace — PostgreSQL 16 + test stand-in for Supabase | **109 / 109 passed** |
| Database tests (pgTAP) | **GitHub — real Supabase, PostgreSQL 17.11** (run 42195333897, log checked) | **109 / 109 passed** |
| Unit tests (Vitest) | Workspace and GitHub | **30 / 30 passed** (22 from Stage 2 + 3 sync + 5 permission-helper tests) |
| Formatting, lint, type-check, build | Workspace and GitHub | Pass |

What the 109 database tests cover:

| File | Tests | Proves |
|---|---|---|
| `01_schema_and_rls` | 17 | RLS on every table; signed-out visitors have no access; audit log and module switches can't be written directly; every business table indexed by `business_id`; reference data consistent; attendant template has no sensitive permissions |
| `02_business_creation` | 16 | Creating a business makes you Owner and seeds settings, roles and modules (all off); direct inserts refused; unique and valid addresses; bad time zones rejected; audit entry written |
| `03_tenant_isolation` | 26 | **Owner of Business A cannot read or change anything in Business B** — business, settings, roles, permissions, members, modules, audit log, profiles — even using B's exact IDs; cannot add herself to B; cannot link A's data to B's roles (composite keys); cannot move members or roles into B; B verified unchanged afterwards |
| `04_roles_and_permissions` | 26 | Attendant can't change business, settings, roles, modules, or promote herself, and can't see costs or change prices; Manager can't switch modules, create roles, make owners, touch the owner, or change himself; can't assign or grant permissions he lacks; suspended members and suspended businesses lose access; last owner can't be removed |
| `05_modules` | 17 | Credit needs Sales and Customers; Sales/Customers can't be disabled while Credit is on; core modules can't be disabled; module switch changes permissions immediately; disabling keeps records; every change audited |
| `06_audit_log` | 7 | Changes logged with person, old and new value; nobody can edit, delete or fake entries; no noise from unchanged saves; staff without permission can't read it |

### Proving the tests can fail

I broke the security on purpose six times and re-ran the tests. **Every break was caught**:

| Deliberate break | Failing tests |
|---|---|
| Businesses readable by any signed-in user | 5 |
| Permission check ignores which business | 9 |
| Suspended members keep access | 2 |
| "Can't assign a role you don't hold" removed | 1 |
| Credit allowed without its dependencies | 2 |
| Settings readable across businesses | 1 |

The migrations were restored exactly afterwards (verified by comparison).

### Problems found and fixed during testing

1. **Leftover table privileges.** Supabase's defaults gave signed-in users `REFERENCES` and `TRIGGER` rights on our tables. They couldn't expose data, but they weren't needed. Fixed by revoking everything and granting back only what each table needs.
2. **Audit noise.** Saving settings without changing anything still created a log entry (the "last updated" time always changes). The log now ignores housekeeping columns.

## Known limitations

- **No sign-up or login screens yet** (Stage 4). The rules are proven at the database level by simulating signed-in users exactly as Supabase does; the app does not call them yet.
- **Server helpers are tested with a simulated database response**, not against a running Supabase API (no Supabase API runs in my workspace). Stage 4 exercises them for real.
- **Database TypeScript types not generated yet** (`src/types/database.ts` is still a placeholder). The generator needs a Docker image my workspace can't download. Stage 4 will generate them in GitHub CI or on your computer.
- **Locations (branches) and sections are not created yet**: sections come in Stage 5; locations only when stock needs them (Stage 7), with one location for your shop.
- **Invitations by email** come in Stage 4; `business_members` already supports a pending invitation (`invited_email`).
- Local tests use PostgreSQL 16 and production uses 17; the GitHub run on 17 covers that difference.

## Decisions taken in this stage

| Decision | Plain-language reason |
|---|---|
| Settings as a table with one named column per setting (plus an `extra` field) | The database can check each value (e.g. discount 0–100 %), which a free-form list can't. |
| Each business gets its own copy of the roles | The owner can edit roles without affecting other businesses. |
| Owner role has every permission automatically | New features never need someone to remember to give the owner access. |
| A Manager role template kept alongside Owner and Attendant | Optional. Your shop can ignore it, or use it for a trusted senior attendant. |
| Members are suspended, never deleted | Their history (who sold what) stays intact. |
| Text fields compared in lowercase instead of using a special text type | Fewer database extensions to manage on a self-hosted server. |

## Acceptance status

| Stage 3 requirement | Status |
|---|---|
| businesses, profiles, business_members, roles & permissions, business_settings, business_modules | Done |
| Every business-owned record linked to `business_id` | Done; checked automatically by a test |
| Supabase Row-Level Security | Done on every table |
| Users only access businesses they belong to | Proven (26 isolation tests) |
| Owners and attendants have different permissions | Proven |
| Authorization enforced in the database and server | Database: proven. Server helpers: written and unit-tested; used from Stage 4 |
| Foreign keys, constraints, indexes | Done, including composite tenant keys |
| Audit logging infrastructure | Done |
| Every migration documented | `docs/database/README.md` |
| Two businesses, separate users, ID manipulation tested | Done |
| Service-role key never in browser code | Unchanged from Stage 2; still verified |
| Isolation tests pass before proceeding | **Pass — locally and on real Supabase** |

**Recommendation:** accept Stage 3. Next is **Stage 4 — Authentication and business accounts**: owner registration, login/logout, password reset, protected pages, profile, business creation and onboarding, business settings and staff management screens.
