# Database guide

How the database is organised, what each migration does, and the rules every future table must follow. Design background: `docs/06-database-schema.md` (with `docs/12-decision-log.md` overriding it where they differ).

## Migrations (in order)

| File | What it does |
|---|---|
| `20261106100000_foundation.sql` | Private `app` schema for helper functions; shared status types; `updated_at` trigger; **audit log** table and the trigger that fills it. |
| `20261106100100_tenancy_tables.sql` | Reference tables (`modules`, `permissions`, `role_templates`, `role_template_permissions`); per-person `profiles` (created automatically at sign-up); per-business `businesses`, `roles`, `role_permissions`, `business_members`, `business_settings`, `business_modules`; audit triggers. |
| `20261106100200_reference_data.sql` | The 13 modules, 48 permissions and 3 role templates (Owner, Manager, Attendant). |
| `20261106100300_security_rls.sql` | Security check functions (`app.is_member`, `app.is_owner`, `app.module_enabled`, `app.has_permission`); exact table privileges; **Row-Level Security policies on every table**. |
| `20261106100400_business_functions_and_guards.sql` | `create_business()`, `set_module_enabled()`, `current_user_permissions()`; guard rules against privilege escalation; "always keep one owner" rule. |

## Tables

### Platform-wide (same for every business, read-only for users)

| Table | Purpose |
|---|---|
| `modules` | Every module, whether it is core, and which modules it requires. Mirrors `src/modules/registry.ts`. |
| `permissions` | Every permission (`module.resource.action`), its module, and whether it is sensitive. Mirrors `src/lib/authz/permissions.ts`. |
| `role_templates`, `role_template_permissions` | Default roles copied into each new business. |

### Per person

| Table | Purpose |
|---|---|
| `profiles` | Name and phone, one row per sign-up. You can see your own profile and those of people in your businesses. |

### Per business (every row has `business_id`)

| Table | Purpose | Who can change it |
|---|---|---|
| `businesses` | Name, address, currency, time zone, status | Created only by `create_business()`; edited with `core.business.update` |
| `business_settings` | Negative stock, returns, discounts, rounding, receipt text… | `core.settings.manage` |
| `business_modules` | Which optional modules are on | Only through `set_module_enabled()` (`core.module.manage`) |
| `roles` | The business's roles (copied from templates, editable) | `core.role.manage`; the owner role is locked |
| `role_permissions` | Which permissions each role has | `core.role.manage`, and only permissions you hold yourself |
| `business_members` | Who belongs to the business, with which role and status | `core.member.manage`, with guard rules below |
| `audit_logs` | Who changed what, before and after | Nobody: written only by triggers. Read with `core.audit.view` |

## How security works (plain language)

1. **Membership.** You can only see a business you are an active member of, and only while the business itself is active.
2. **Permissions.** Each action needs a permission. The owner role has all of them automatically; other roles have a list the owner controls.
3. **Modules.** A permission only works while its module is switched on. Even the owner has no Sales permissions while Sales is off.
4. **Row-Level Security.** PostgreSQL applies rules 1–3 to every query. A request for another business's data returns nothing; a write to it is refused.
5. **Guard rules** stop people giving themselves more power:
   - nobody can change their own role or status;
   - only an owner can give or remove the owner role;
   - nobody can assign a role containing permissions they don't hold, or grant such permissions;
   - the owner role cannot be edited, deleted or given explicit permissions;
   - a business always keeps at least one active owner (checked when the change is saved, so ownership can be handed over).
6. **Composite foreign keys** `(business_id, id)` make it impossible for a row in Business A to point at a row in Business B.
7. **Signed-out visitors** have no access to any table.

## Rules for every future business table

Every table added in later stages must have:

- `business_id uuid not null` and `unique (business_id, id)`;
- composite foreign keys `(business_id, parent_id) → parent (business_id, id)`;
- an index that starts with `business_id`;
- `alter table … enable row level security` plus policies using `app.is_member` / `app.has_permission`;
- explicit `revoke all … from anon, authenticated` followed by only the grants it needs;
- for ledgers (stock movements, payments…): no `update`/`delete` grants; writes only through `SECURITY DEFINER` functions;
- an audit trigger if changes are sensitive;
- pgTAP tests proving another business cannot read or write it.

Test `01_schema_and_rls.test.sql` checks the RLS, index and `anon` rules automatically for every table.

## Running the database tests

| Where | Command | Database |
|---|---|---|
| Your computer, with Docker | `npm run db:start`, then `npm run db:test` | Real Supabase (PostgreSQL 17) |
| Without Docker | `npm run db:test:local` | Plain PostgreSQL 15+ with a test-only Supabase stand-in (`scripts/db/supabase-shim.sql`) |
| GitHub | Automatic on every push (`database` job) | Real Supabase |

Test files are in `supabase/tests/database/`; shared helpers in `helpers.psql`.

## Calling the database from the app

- Use `createClient()` from `src/lib/supabase/server.ts` in Server Components and Server Actions; it acts as the signed-in user, so RLS applies.
- Check permissions early with `requirePermission()` from `src/lib/authz/server.ts` for clear error messages. The database checks again regardless.
- Use `createAdminClient()` (service role, bypasses RLS) only for narrowly scoped, audited tasks.
