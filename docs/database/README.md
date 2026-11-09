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
| `20261106120000_members_and_invitations.sql` | Stage 4. Staff invitations (`invite_member`, `my_pending_invitations`, `accept_invitation`, `decline_invitation`, `cancel_invitation`), staff list with emails (`business_member_directory`), and business protections: currency fixed after creation; status controlled by the platform. |
| `20261106120100_fix_permission_delegation.sql` | Stage 4 fix. Separates "can you **use** a permission now" (`app.has_permission`, needs the module on) from "is it yours to **hand out**" (`app.role_grants`, module ignored). Before this, nobody could invite an attendant while Sales was off. |
| `20261106120200_fix_owner_check_visibility.sql` | Stage 4 fix. The "keep one active owner" check runs when changes are saved, as the person saving; a new attendant could not see the owner, so accepting an invitation failed. The check now runs with full visibility. |
| `20261106140000_sections_and_categories.sql` | Stage 5. `sections` (departments) and `categories` (groupings inside a section): unique names ignoring capitals, tidied spacing, archive/restore only (no deletion), no new categories in an archived section, composite keys so a category can only sit in a section of the same business, audit triggers, RLS. |
| `20261108200000_products_variants_units_prices.sql` | Stage 6. `units` (12 starter units per business, e.g. pc, pack, ctn, crate, kg; each business can add its own), `products` (section required, category optional, a fixed base unit, up to 3 option names such as Size and Colour), `product_units` (how many base units a pack or carton holds), `product_variants` (one per option combination; SKU and barcode unique in the business ignoring capitals; option combinations unique ignoring capitals), `variant_prices` and `variant_costs` (history tables: a change closes the old row and opens a new one; written only by `set_variant_price()` / `set_variant_cost()`; costs visible only with `inventory.cost.view`). `create_product()` saves a product with all its variants, units and prices in one step. Archive/restore only; RLS and audit on every table. |
| `20261109090000_core_inventory.sql` | Stage 7. `stock_levels` (current stock per variant, created automatically), `stock_movements` (the append-only stock ledger: type, signed quantity in the base unit, balance before and after, what was entered e.g. 2 ctn × 12, reason, who, when; never changed or deleted, even by an administrator), `stock_counts` and `stock_count_lines` (stocktakes; one open at a time). Stock changes only through `record_stock_movement()`, `post_stock_count()` and the internal `app.apply_stock_movement()`, which locks the item's balance while it changes. Negative stock follows the business setting (refused, or allowed after confirmation). Reading: `stock_overview()`, `stock_summary()`, `stock_movement_history()`; reconciliation: `check_stock_records()`. |

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
| `sections` | Departments such as Groceries or Frozen Food | `catalog.section.manage`; read with `catalog.product.view`. Archived, never deleted |
| `categories` | Groupings inside one section, such as Rice or Jalab | Same as sections. Cannot be added to or moved into an archived section |

## How staff join a business

1. An owner (or anyone with *Invite, suspend and change roles of staff*) enters the person's email and a role in **Settings → Staff**. This saves an invitation; no email is sent by the app.
2. The person creates an account (or signs in) with that **same, confirmed** email address.
3. They see the invitation on the *Get started* screen and accept or decline it.
4. The inviter can withdraw a pending invitation. Staff are suspended rather than deleted.

Rules: you can only invite with a role whose permissions you hold yourself; only owners can invite owners; an unconfirmed email cannot see or accept invitations.

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
