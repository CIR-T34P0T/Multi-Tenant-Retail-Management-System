# 06 — Detailed Database Schema

Status: Draft v0.1 · 6 November 2026 · Target: PostgreSQL (Supabase)

This is a **design specification**, not a migration. DDL is written to be precise and reviewable; it will be split into ordered migrations per module during implementation. Tables marked *(TBC)* depend on open questions and should not be created until answered.

---

## 1. Conventions

| Convention | Rule |
|---|---|
| Primary keys | `uuid` via `gen_random_uuid()` (devices can generate IDs offline). High-volume logs use `bigint identity`. |
| Tenant key | Every tenant-owned table has `business_id uuid not null`. |
| Tenant-safe references | Every tenant table has `unique (business_id, id)`; child tables reference parents with **composite FKs** `(business_id, parent_id) → parent(business_id, id)`. |
| Money | `numeric(18,2)` in the business currency. |
| Quantities | `numeric(18,4)`; stock always in the product's base unit. |
| Costs / factors | `numeric(18,4)` for unit costs, `numeric(18,6)` for unit conversion factors. |
| Time | `timestamptz` (UTC). Business-day logic uses `businesses.timezone`. `occurred_at` = when it happened (may be offline device time); `created_at` = when the server recorded it. |
| Status | Postgres enums for system-defined states; lookup tables for tenant-configurable lists. |
| Soft delete | Master data uses `status` (`active` / `inactive` / `archived`); transactional documents are never deleted (voided/cancelled instead). |
| Audit columns | `created_at`, `created_by`, `updated_at`, `updated_by` on mutable tables (abbreviated as `…audit` below). |
| Append-only | `stock_movements`, `customer_account_entries`, `supplier_account_entries`, `journal_lines`, `audit_logs`, `business_events`: UPDATE/DELETE blocked by trigger and by revoking privileges. |
| Naming | snake_case, plural table names, `<entity>_id` FKs. Helper functions live in schema `app`. |
| RLS | Enabled on every table in `public`. See §15. |
| Postgres version | Requires PostgreSQL 15+ (`UNIQUE NULLS NOT DISTINCT`). Exclusion constraints on `uuid` columns rely on `btree_gist` uuid support — verify on the target Supabase version in Phase 0; fall back to enforcement inside the price-change function if unavailable. |

`…audit` expands to:

```sql
created_at timestamptz not null default now(),
created_by uuid references auth.users(id),
updated_at timestamptz not null default now(),
updated_by uuid references auth.users(id)
```

## 2. Extensions and enums

```sql
create extension if not exists pgcrypto;     -- gen_random_uuid()
create extension if not exists citext;       -- case-insensitive codes/emails
create extension if not exists btree_gist;   -- exclusion constraints on price periods
create extension if not exists pg_cron;      -- scheduled jobs (Supabase)
create schema if not exists app;

create type record_status        as enum ('active','inactive','archived');
create type location_type        as enum ('store','warehouse','other');
create type member_status        as enum ('invited','active','suspended');
create type product_type         as enum ('stocked','non_stocked','service');
create type attribute_data_type  as enum ('text','number','boolean','date','select','multiselect');
create type attribute_scope      as enum ('product','variant');
create type unit_kind            as enum ('count','mass','volume','length','area','time','other');
create type payment_kind         as enum ('cash','bank_transfer','card','mobile_money','customer_credit','store_credit','other');

create type movement_type as enum (
  'opening_balance','purchase_receipt','purchase_return',
  'sale','sale_return','sale_void',
  'transfer_out','transfer_in',
  'adjustment_in','adjustment_out','count_variance',
  'damage','expiry','internal_use'
);

create type doc_status      as enum ('draft','pending_approval','posted','cancelled');
create type sale_status     as enum ('held','completed','voided');
create type payment_status  as enum ('unpaid','partial','paid','refunded');
create type transfer_status as enum ('draft','dispatched','received','cancelled');
create type count_status    as enum ('draft','counting','review','posted','cancelled');
create type session_status  as enum ('open','closed','reconciled');
create type po_status       as enum ('draft','sent','partially_received','received','cancelled');
create type account_type    as enum ('asset','liability','equity','income','expense');
create type period_status   as enum ('open','closed','locked');
create type journal_status  as enum ('posted','reversed');
create type consumption_status as enum ('pending','processed','skipped','failed');
```

---

## 3. Platform, tenancy & configuration

```sql
create table businesses (
  id              uuid primary key default gen_random_uuid(),
  slug            citext not null unique,
  name            text   not null,
  legal_name      text,
  template_key    text,                         -- seed template used at creation; NOT a behaviour switch
  country_code    char(2) not null default 'NG',
  currency_code   char(3) not null default 'NGN',
  timezone        text    not null default 'Africa/Lagos',
  locale          text    not null default 'en-NG',
  tax_id          text,
  phone           text,
  email           citext,
  address         text,
  logo_path       text,
  settings        jsonb   not null default '{}',   -- validated by app schema; see §3.1
  status          text    not null default 'active' check (status in ('active','suspended','closed')),
  …audit
);

create table locations (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id),
  code          citext not null,
  name          text not null,
  type          location_type not null default 'store',
  address       text,
  phone         text,
  is_sellable   boolean not null default true,      -- can POS sell from here
  status        record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, code)
);

create table profiles (                               -- 1:1 with auth.users
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table platform_staff (                         -- our own administrators
  user_id   uuid primary key references auth.users(id),
  role      text not null check (role in ('platform_admin','support')),
  created_at timestamptz not null default now()
);

create table support_sessions (                       -- audited access to a tenant (FR-PLT-009)
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references platform_staff(user_id),
  business_id  uuid not null references businesses(id),
  reason       text not null,
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  ended_at     timestamptz
);

-- Modules
create table modules (
  code        text primary key,                      -- 'catalog','inventory','sales','accounting',...
  name        text not null,
  is_core     boolean not null default false,
  depends_on  text[] not null default '{}'
);

create table business_modules (
  business_id  uuid not null references businesses(id),
  module_code  text not null references modules(code),
  is_enabled   boolean not null default false,
  config       jsonb not null default '{}',
  enabled_at   timestamptz,
  disabled_at  timestamptz,
  updated_by   uuid references auth.users(id),
  primary key (business_id, module_code)
);

-- Document numbering
create table document_sequences (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  location_id  uuid,                                  -- null = business-wide
  doc_type     text not null,                         -- 'sale','return','grn','transfer','adjustment','count','po','expense','journal'
  prefix       text not null,
  padding      int  not null default 6 check (padding between 3 and 12),
  next_value   bigint not null default 1,
  foreign key (business_id, location_id) references locations(business_id, id),
  unique nulls not distinct (business_id, location_id, doc_type)
);
-- app.next_document_number(business_id, location_id, doc_type) locks the row (SELECT … FOR UPDATE).

-- POS devices (offline numbering and sync)
create table pos_devices (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  location_id     uuid not null,
  name            text not null,
  receipt_prefix  text not null,                      -- e.g. 'IK-D2'
  next_receipt_no bigint not null default 1,          -- device advances locally; server records high-water mark
  last_seen_at    timestamptz,
  last_sync_at    timestamptz,
  app_version     text,
  status          record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, receipt_prefix),
  foreign key (business_id, location_id) references locations(business_id, id)
);

-- Configurable lists
create table payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references businesses(id),
  name                text not null,
  kind                payment_kind not null,
  affects_cash_drawer boolean not null default false,
  requires_reference  boolean not null default false,
  sort_order          int not null default 0,
  status              record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, name)
);

create table reason_codes (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id),
  code           citext not null,
  name           text not null,
  applies_to     text[] not null,                     -- e.g. {'adjustment','damage','expiry','return','void','cash_payout'}
  requires_note  boolean not null default false,
  status         record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, code)
);

create table tax_rates (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  name         text not null,                         -- e.g. 'VAT', 'Exempt', 'Zero-rated'
  rate         numeric(7,4) not null check (rate >= 0 and rate <= 100),
  status       record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, name)
);
```

### 3.1 `businesses.settings` keys (validated in app; proposed)

| Key | Type | Default |
|---|---|---|
| `allow_negative_stock` | boolean | `false` (TBC Q-I01) |
| `prices_include_tax` | boolean | `true` (TBC Q-F03) |
| `cash_rounding_increment` | decimal | `0` (none) (TBC Q-S05) |
| `require_customer_on_sale` | boolean | `false` |
| `max_discount_pct_without_override` | decimal | `0` (TBC Q-S04) |
| `void_window` | `'session'` \| `'same_day'` \| `'none'` | `'session'` |
| `adjustment_approval_threshold_value` | decimal \| null | `null` |
| `receipt_header`, `receipt_footer` | text | `''` |
| `default_price_list_id`, `default_location_id` | uuid | — |
| `sku_pattern` | text | `'{CAT}-{SEQ}'` |

---

## 4. Identity, roles & permissions

```sql
create table permissions (
  code         text primary key,                      -- 'sales.sale.void'
  module_code  text not null references modules(code),
  description  text not null,
  is_sensitive boolean not null default false         -- requires override/approval UX
);

create table role_templates (                         -- platform-level defaults (doc 08)
  key          text primary key,                      -- 'owner','manager','cashier',...
  name         text not null,
  description  text,
  permissions  text[] not null
);

create table roles (                                  -- per-business, copied from templates, editable
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  key          citext not null,
  name         text not null,
  description  text,
  is_owner     boolean not null default false,        -- owner role cannot lose permissions or be deleted
  template_key text references role_templates(key),
  …audit,
  unique (business_id, id),
  unique (business_id, key)
);

create table role_permissions (
  business_id     uuid not null,
  role_id         uuid not null,
  permission_code text not null references permissions(code),
  primary key (role_id, permission_code),
  foreign key (business_id, role_id) references roles(business_id, id) on delete cascade
);

create table business_members (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id),
  user_id          uuid references auth.users(id),    -- null while invitation pending
  invited_email    citext,
  invited_phone    text,
  role_id          uuid not null,
  status           member_status not null default 'invited',
  all_locations    boolean not null default true,
  pos_pin_hash     text,                               -- TBC Q-U02 (quick switch / override)
  invited_by       uuid references auth.users(id),
  invited_at       timestamptz,
  joined_at        timestamptz,
  …audit,
  unique (business_id, id),
  unique (business_id, user_id),
  foreign key (business_id, role_id) references roles(business_id, id)
);

create table member_locations (                        -- used when all_locations = false
  business_id  uuid not null,
  member_id    uuid not null,
  location_id  uuid not null,
  primary key (member_id, location_id),
  foreign key (business_id, member_id)   references business_members(business_id, id) on delete cascade,
  foreign key (business_id, location_id) references locations(business_id, id)
);

create table member_invitations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null,
  member_id    uuid not null,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  foreign key (business_id, member_id) references business_members(business_id, id) on delete cascade
);
```

Decision ADR-011 (proposed): **one role per member per business** in MVP; the schema can move to a `member_roles` join table later if needed.

---

## 5. Catalogue

```sql
create table units (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  code            citext not null,                    -- 'pc','pack','ctn','crate','kg','g','l','yd'
  name            text not null,
  kind            unit_kind not null,
  allows_decimal  boolean not null default false,
  decimal_places  smallint not null default 0 check (decimal_places between 0 and 4),
  status          record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, code)
);

create table sections (                              -- departments within one business (v0.3)
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  name         text not null,                         -- 'Groceries','Frozen Food','Islamic Wear'
  code         citext,
  description  text,
  sort_order   int not null default 0,
  status       record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, name)
);

create table categories (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  section_id   uuid not null,                         -- every category belongs to one section
  parent_id    uuid,
  name         text not null,
  code         citext,                                -- used in SKU patterns
  sort_order   int not null default 0,
  status       record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, section_id, id),               -- target for products' composite FK
  unique nulls not distinct (business_id, section_id, parent_id, name),
  foreign key (business_id, section_id) references sections(business_id, id),
  foreign key (business_id, parent_id) references categories(business_id, id)
);
-- Triggers: cycle prevention; a sub-category must have the same section as its parent.

create table attribute_definitions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  code            citext not null,                    -- 'size','colour','fabric','weight_net'
  name            text not null,
  data_type       attribute_data_type not null,
  options         jsonb not null default '[]',        -- for select/multiselect: [{"value":"L","label":"Large","sort":3}]
  unit_id         uuid,                               -- for number attributes, e.g. grams
  is_variant_axis boolean not null default false,     -- only select-type attributes may be axes
  is_filterable   boolean not null default true,
  status          record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, code),
  foreign key (business_id, unit_id) references units(business_id, id),
  check (not is_variant_axis or data_type = 'select')
);

create table category_attributes (
  business_id   uuid not null,
  category_id   uuid not null,
  attribute_id  uuid not null,
  scope         attribute_scope not null default 'product',
  is_required   boolean not null default false,
  sort_order    int not null default 0,
  primary key (category_id, attribute_id),
  foreign key (business_id, category_id)  references categories(business_id, id) on delete cascade,
  foreign key (business_id, attribute_id) references attribute_definitions(business_id, id)
);

create table brands (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  name         text not null,
  status       record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, name)
);

create table products (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id),
  section_id       uuid not null,
  category_id      uuid,                              -- optional; must be in the same section
  brand_id         uuid,
  name             text not null,
  description      text,
  product_type     product_type not null default 'stocked',
  base_unit_id     uuid not null,
  tax_rate_id      uuid,
  track_batches    boolean not null default false,    -- TBC Q-C02
  track_expiry     boolean not null default false,    -- TBC Q-C02
  attributes       jsonb not null default '{}',       -- product-scope values keyed by attribute code
  search_text      tsvector generated always as
                     (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,''))) stored,
  status           record_status not null default 'active',
  …audit,
  unique (business_id, id),
  foreign key (business_id, section_id)   references sections(business_id, id),
  foreign key (business_id, section_id, category_id) references categories(business_id, section_id, id),
  foreign key (business_id, brand_id)     references brands(business_id, id),
  foreign key (business_id, base_unit_id) references units(business_id, id),
  foreign key (business_id, tax_rate_id)  references tax_rates(business_id, id),
  check (not track_expiry or track_batches)           -- expiry is tracked per batch
);

create table product_images (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null,
  product_id   uuid not null,
  variant_id   uuid,                                  -- optional: image for a colour variant
  storage_path text not null,                         -- '{business_id}/products/{product_id}/{uuid}.webp'
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  foreign key (business_id, product_id) references products(business_id, id) on delete cascade
);

create table product_variants (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null,
  product_id          uuid not null,
  sku                 citext not null,
  name                text,                           -- e.g. 'White / L' (generated)
  variant_attributes  jsonb not null default '{}',    -- {"size":"L","colour":"white"}
  is_default          boolean not null default false,
  reorder_level       numeric(18,4),                  -- base units
  reorder_qty         numeric(18,4),
  status              record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, sku),
  unique (product_id, variant_attributes),
  foreign key (business_id, product_id) references products(business_id, id)
);
create unique index one_default_variant on product_variants(product_id) where is_default;

create table product_units (                          -- allowed units for a product
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null,
  product_id    uuid not null,
  unit_id       uuid not null,
  factor        numeric(18,6) not null check (factor > 0),   -- base units per 1 of this unit
  is_base       boolean not null default false,
  can_sell      boolean not null default true,
  can_purchase  boolean not null default true,
  status        record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (product_id, unit_id),
  foreign key (business_id, product_id) references products(business_id, id) on delete cascade,
  foreign key (business_id, unit_id)    references units(business_id, id),
  check (not is_base or factor = 1)
);

create table variant_barcodes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null,
  variant_id   uuid not null,
  unit_id      uuid not null,                          -- scanning this barcode adds 1 of this unit
  barcode      text not null,
  created_at   timestamptz not null default now(),
  unique (business_id, barcode),
  foreign key (business_id, variant_id) references product_variants(business_id, id) on delete cascade,
  foreign key (business_id, unit_id)    references units(business_id, id)
);
```

**Why JSONB for attribute values (ADR-003, proposed):** values are validated against `attribute_definitions` by the app and by a trigger; JSONB with a GIN index gives flexible filtering without a wide EAV join on every product query. A normalised `product_attribute_values` table can be added later if reporting by attribute becomes heavy.

---

## 6. Pricing

```sql
create table price_lists (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  name         text not null,                          -- 'Retail', 'Wholesale' (TBC Q-S02)
  is_default   boolean not null default false,
  status       record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, name)
);
create unique index one_default_price_list on price_lists(business_id) where is_default;

create table variant_prices (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  price_list_id   uuid not null,
  variant_id      uuid not null,
  unit_id         uuid not null,
  location_id     uuid,                                 -- null = all locations (TBC Q-S02)
  min_quantity    numeric(18,4) not null default 1,     -- quantity break, in this unit
  price           numeric(18,2) not null check (price >= 0),
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,                          -- null = open-ended
  change_note     text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  foreign key (business_id, price_list_id) references price_lists(business_id, id),
  foreign key (business_id, variant_id)    references product_variants(business_id, id),
  foreign key (business_id, unit_id)       references units(business_id, id),
  foreign key (business_id, location_id)   references locations(business_id, id),
  check (effective_to is null or effective_to > effective_from),
  -- no overlapping validity for the same price point
  exclude using gist (
    price_list_id with =, variant_id with =, unit_id with =,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    min_quantity with =,
    tstzrange(effective_from, effective_to) with &&
  )
);
-- Price rows are never updated except to set effective_to when superseded.
-- History = all rows for a variant ordered by effective_from.
```

`app.resolve_price(business_id, variant_id, unit_id, quantity, location_id, price_list_id, at timestamptz)` implements FR-PRC-007.

---

## 7. Inventory

```sql
create table inventory_batches (                       -- TBC Q-C02
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null,
  variant_id       uuid not null,
  batch_no         text,
  expiry_date      date,
  manufactured_on  date,
  supplier_id      uuid,
  created_at       timestamptz not null default now(),
  unique (business_id, id),
  unique nulls not distinct (business_id, variant_id, batch_no, expiry_date),
  foreign key (business_id, variant_id) references product_variants(business_id, id)
);

create table stock_movements (                          -- THE inventory ledger (append-only)
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null,
  location_id          uuid not null,
  variant_id           uuid not null,
  batch_id             uuid,
  movement_type        movement_type not null,
  quantity             numeric(18,4) not null check (quantity <> 0),  -- signed, base units
  balance_before       numeric(18,4) not null,                         -- on_hand before (v0.3)
  balance_after        numeric(18,4) not null,                         -- on_hand after
  unit_cost            numeric(18,4) not null default 0,               -- cost per base unit
  source_type          text not null,       -- 'sale','sale_return','goods_receipt','purchase_return','transfer','adjustment','stock_count','opening'
  source_id            uuid not null,
  source_line_id       uuid,
  reason_code_id       uuid,
  reverses_movement_id uuid,
  note                 text,
  occurred_at          timestamptz not null,
  created_at           timestamptz not null default now(),
  created_by           uuid not null references auth.users(id),
  foreign key (business_id, location_id)    references locations(business_id, id),
  foreign key (business_id, variant_id)     references product_variants(business_id, id),
  foreign key (business_id, batch_id)       references inventory_batches(business_id, id),
  foreign key (business_id, reason_code_id) references reason_codes(business_id, id)
);
create index sm_stock_card on stock_movements (business_id, variant_id, location_id, occurred_at, id);
create index sm_source     on stock_movements (business_id, source_type, source_id);

create table stock_levels (                              -- cached balance, written only by posting functions
  business_id       uuid not null,
  location_id       uuid not null,
  variant_id        uuid not null,
  on_hand           numeric(18,4) not null default 0,
  avg_cost          numeric(18,4) not null default 0,
  last_movement_at  timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (location_id, variant_id),
  foreign key (business_id, location_id) references locations(business_id, id),
  foreign key (business_id, variant_id)  references product_variants(business_id, id)
);
create index sl_business on stock_levels (business_id, variant_id);

create table batch_stock_levels (                        -- TBC Q-C02
  business_id  uuid not null,
  location_id  uuid not null,
  batch_id     uuid not null,
  on_hand      numeric(18,4) not null default 0,
  primary key (location_id, batch_id),
  foreign key (business_id, batch_id) references inventory_batches(business_id, id)
);

create table location_reorder_levels (                   -- optional per-location override
  business_id    uuid not null,
  location_id    uuid not null,
  variant_id     uuid not null,
  reorder_level  numeric(18,4),
  reorder_qty    numeric(18,4),
  primary key (location_id, variant_id)
);

-- Adjustments (also used for damage, expiry, internal use, opening balances)
create table stock_adjustments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  location_id     uuid not null,
  number          text not null,
  kind            text not null check (kind in ('adjustment','damage','expiry','internal_use','opening')),
  status          doc_status not null default 'draft',
  reason_code_id  uuid,
  note            text,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  posted_by       uuid references auth.users(id),
  posted_at       timestamptz,
  …audit,
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, location_id) references locations(business_id, id)
);

create table stock_adjustment_lines (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  adjustment_id   uuid not null,
  variant_id      uuid not null,
  batch_id        uuid,
  unit_id         uuid not null,
  quantity        numeric(18,4) not null check (quantity <> 0),   -- signed, entered unit
  factor          numeric(18,6) not null,
  base_quantity   numeric(18,4) not null,
  unit_cost       numeric(18,4),                                   -- required for positive opening/adjustment-in
  reason_code_id  uuid,
  foreign key (business_id, adjustment_id) references stock_adjustments(business_id, id) on delete cascade,
  foreign key (business_id, variant_id)    references product_variants(business_id, id)
);

-- Transfers
create table stock_transfers (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null,
  number             text not null,
  from_location_id   uuid not null,
  to_location_id     uuid not null,
  status             transfer_status not null default 'draft',
  note               text,
  dispatched_by      uuid references auth.users(id),
  dispatched_at      timestamptz,
  received_by        uuid references auth.users(id),
  received_at        timestamptz,
  …audit,
  unique (business_id, id),
  unique (business_id, number),
  check (from_location_id <> to_location_id),
  foreign key (business_id, from_location_id) references locations(business_id, id),
  foreign key (business_id, to_location_id)   references locations(business_id, id)
);

create table stock_transfer_lines (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null,
  transfer_id          uuid not null,
  variant_id           uuid not null,
  batch_id             uuid,
  unit_id              uuid not null,
  factor               numeric(18,6) not null,
  quantity_sent        numeric(18,4) not null check (quantity_sent > 0),
  quantity_received    numeric(18,4),
  base_quantity_sent   numeric(18,4) not null,
  base_quantity_received numeric(18,4),
  unit_cost            numeric(18,4),                          -- avg cost at dispatch
  variance_reason_id   uuid,
  foreign key (business_id, transfer_id) references stock_transfers(business_id, id) on delete cascade,
  foreign key (business_id, variant_id)  references product_variants(business_id, id)
);

-- Stock counts
create table stock_counts (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null,
  location_id   uuid not null,
  number        text not null,
  scope         text not null check (scope in ('full','category','selection')),
  scope_filter  jsonb not null default '{}',
  is_blind      boolean not null default true,
  status        count_status not null default 'draft',
  snapshot_at   timestamptz,                                -- expected quantities captured here
  posted_by     uuid references auth.users(id),
  posted_at     timestamptz,
  …audit,
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, location_id) references locations(business_id, id)
);

create table stock_count_lines (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null,
  count_id           uuid not null,
  variant_id         uuid not null,
  batch_id           uuid,
  expected_quantity  numeric(18,4) not null,                -- base units at snapshot
  counted_quantity   numeric(18,4),                         -- base units
  movements_since_snapshot numeric(18,4) not null default 0, -- sales during counting
  variance           numeric(18,4) generated always as
                       (coalesce(counted_quantity,0) - expected_quantity - movements_since_snapshot) stored,
  counted_by         uuid references auth.users(id),
  counted_at         timestamptz,
  foreign key (business_id, count_id)   references stock_counts(business_id, id) on delete cascade,
  foreign key (business_id, variant_id) references product_variants(business_id, id)
);
```

---

## 8. Parties (customers & suppliers)

```sql
create table customers (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  code            citext,
  name            text not null,
  phone           text,
  email           citext,
  address         text,
  price_list_id   uuid,
  allow_credit    boolean not null default false,      -- TBC Q-F01
  credit_limit    numeric(18,2),
  marketing_consent boolean not null default false,
  notes           text,
  anonymised_at   timestamptz,                         -- data-protection erasure (NFR-PRV-002)
  status          record_status not null default 'active',
  …audit,
  unique (business_id, id),
  foreign key (business_id, price_list_id) references price_lists(business_id, id)
);
create unique index customers_phone_uq on customers (business_id, phone) where phone is not null and status <> 'archived';

create table suppliers (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references businesses(id),
  name                text not null,
  contact_name        text,
  phone               text,
  email               citext,
  address             text,
  payment_terms_days  int,
  notes               text,
  status              record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, name)
);
```

---

## 9. Purchasing

```sql
create table purchase_orders (                            -- P2, optional module 'purchase_orders'
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  number          text not null,
  supplier_id     uuid not null,
  location_id     uuid not null,
  status          po_status not null default 'draft',
  expected_on     date,
  subtotal        numeric(18,2) not null default 0,
  tax_total       numeric(18,2) not null default 0,
  total           numeric(18,2) not null default 0,
  note            text,
  …audit,
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, supplier_id) references suppliers(business_id, id),
  foreign key (business_id, location_id) references locations(business_id, id)
);

create table purchase_order_lines (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null,
  purchase_order_id   uuid not null,
  variant_id          uuid not null,
  unit_id             uuid not null,
  factor              numeric(18,6) not null,
  quantity            numeric(18,4) not null check (quantity > 0),
  unit_cost           numeric(18,4) not null,
  tax_rate_id         uuid,
  line_total          numeric(18,2) not null,
  received_base_qty   numeric(18,4) not null default 0,
  foreign key (business_id, purchase_order_id) references purchase_orders(business_id, id) on delete cascade,
  foreign key (business_id, variant_id) references product_variants(business_id, id)
);

create table goods_receipts (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null,
  number                text not null,
  supplier_id           uuid,                           -- nullable: walk-in market purchases (TBC Q-I04)
  location_id           uuid not null,
  purchase_order_id     uuid,
  supplier_invoice_ref  text,
  received_at           timestamptz not null default now(),
  status                doc_status not null default 'draft',
  subtotal              numeric(18,2) not null default 0,
  tax_total             numeric(18,2) not null default 0,
  extra_costs           numeric(18,2) not null default 0,   -- landed costs, TBC Q-I05
  total                 numeric(18,2) not null default 0,
  amount_paid           numeric(18,2) not null default 0,   -- TBC Q-F02
  note                  text,
  posted_by             uuid references auth.users(id),
  posted_at             timestamptz,
  …audit,
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, supplier_id)       references suppliers(business_id, id),
  foreign key (business_id, location_id)       references locations(business_id, id),
  foreign key (business_id, purchase_order_id) references purchase_orders(business_id, id)
);

create table goods_receipt_lines (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null,
  goods_receipt_id    uuid not null,
  po_line_id          uuid,
  variant_id          uuid not null,
  unit_id             uuid not null,
  factor              numeric(18,6) not null,
  quantity            numeric(18,4) not null check (quantity > 0),
  base_quantity       numeric(18,4) not null,
  unit_cost           numeric(18,4) not null check (unit_cost >= 0),   -- per entered unit, ex-tax
  base_unit_cost      numeric(18,4) not null,                          -- incl. apportioned extra costs
  tax_rate_id         uuid,
  line_total          numeric(18,2) not null,
  batch_no            text,
  expiry_date         date,
  batch_id            uuid,
  foreign key (business_id, goods_receipt_id) references goods_receipts(business_id, id) on delete cascade,
  foreign key (business_id, variant_id) references product_variants(business_id, id),
  foreign key (business_id, unit_id)    references units(business_id, id)
);

create table purchase_returns (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null,
  number            text not null,
  supplier_id       uuid,
  location_id       uuid not null,
  goods_receipt_id  uuid,
  status            doc_status not null default 'draft',
  total             numeric(18,2) not null default 0,
  reason_code_id    uuid,
  note              text,
  posted_by         uuid references auth.users(id),
  posted_at         timestamptz,
  …audit,
  unique (business_id, id),
  unique (business_id, number)
);

create table purchase_return_lines (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null,
  purchase_return_id  uuid not null,
  grn_line_id         uuid,
  variant_id          uuid not null,
  batch_id            uuid,
  unit_id             uuid not null,
  factor              numeric(18,6) not null,
  quantity            numeric(18,4) not null check (quantity > 0),
  base_quantity       numeric(18,4) not null,
  unit_cost           numeric(18,4) not null,
  line_total          numeric(18,2) not null,
  foreign key (business_id, purchase_return_id) references purchase_returns(business_id, id) on delete cascade
);
```

---

## 10. Sales, cash & returns

```sql
create table cash_sessions (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null,
  location_id      uuid not null,
  device_id        uuid,
  number           text not null,
  opened_by        uuid not null references auth.users(id),
  opened_at        timestamptz not null default now(),
  opening_float    numeric(18,2) not null default 0,
  closed_by        uuid references auth.users(id),
  closed_at        timestamptz,
  expected_cash    numeric(18,2),
  counted_cash     numeric(18,2),
  cash_variance    numeric(18,2),
  denomination_count jsonb,                              -- {"1000": 12, "500": 4, ...}
  totals_by_method jsonb,                                -- snapshot at close
  status           session_status not null default 'open',
  reconciled_by    uuid references auth.users(id),
  reconciled_at    timestamptz,
  note             text,
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, location_id) references locations(business_id, id),
  foreign key (business_id, device_id)   references pos_devices(business_id, id)
);
create unique index one_open_session_per_device on cash_sessions (device_id) where status = 'open';

create table cash_movements (                              -- pay-ins / pay-outs / drops
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null,
  cash_session_id  uuid not null,
  kind             text not null check (kind in ('pay_in','pay_out','drop')),
  amount           numeric(18,2) not null check (amount > 0),
  reason_code_id   uuid,
  note             text,
  expense_id       uuid,                                   -- set when Expenses module records it
  occurred_at      timestamptz not null default now(),
  created_by       uuid not null references auth.users(id),
  foreign key (business_id, cash_session_id) references cash_sessions(business_id, id)
);

create table sales (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null,
  location_id       uuid not null,
  device_id         uuid,
  cash_session_id   uuid,
  number            text not null,                         -- server or device-issued
  client_ref        uuid not null,                         -- idempotency key from device
  channel           text not null default 'pos',           -- future: 'invoice','online'
  status            sale_status not null default 'held',
  customer_id       uuid,
  price_list_id     uuid,
  subtotal          numeric(18,2) not null default 0,      -- before discounts, after line pricing
  discount_total    numeric(18,2) not null default 0,
  tax_total         numeric(18,2) not null default 0,
  rounding          numeric(18,2) not null default 0,
  total             numeric(18,2) not null default 0,
  amount_paid       numeric(18,2) not null default 0,
  change_given      numeric(18,2) not null default 0,
  balance_due       numeric(18,2) not null default 0,       -- > 0 only for credit sales (TBC Q-F01)
  payment_status    payment_status not null default 'unpaid',
  sold_by           uuid not null references auth.users(id),
  occurred_at       timestamptz not null,                   -- device time
  completed_at      timestamptz,
  synced_at         timestamptz,                            -- set when created via offline sync
  is_offline        boolean not null default false,
  needs_review      boolean not null default false,         -- sync conflicts (FR-OFF-005)
  review_notes      jsonb,
  voided_at         timestamptz,
  voided_by         uuid references auth.users(id),
  void_reason_id    uuid,
  note              text,
  created_at        timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  unique (business_id, client_ref),
  foreign key (business_id, location_id)     references locations(business_id, id),
  foreign key (business_id, cash_session_id) references cash_sessions(business_id, id),
  foreign key (business_id, customer_id)     references customers(business_id, id),
  foreign key (business_id, price_list_id)   references price_lists(business_id, id)
);
create index sales_by_day on sales (business_id, location_id, completed_at);

create table sale_lines (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null,
  sale_id             uuid not null,
  line_no             int not null,
  variant_id          uuid not null,
  unit_id             uuid not null,
  description         text not null,                        -- snapshot of product/variant name
  quantity            numeric(18,4) not null check (quantity > 0),
  factor              numeric(18,6) not null,
  base_quantity       numeric(18,4) not null,
  list_price          numeric(18,2) not null,               -- resolved price per entered unit
  unit_price          numeric(18,2) not null,               -- charged price per entered unit
  price_overridden_by uuid references auth.users(id),
  discount_amount     numeric(18,2) not null default 0,
  tax_rate_id         uuid,
  tax_rate            numeric(7,4) not null default 0,      -- snapshot
  tax_amount          numeric(18,2) not null default 0,
  line_total          numeric(18,2) not null,
  unit_cost_snapshot  numeric(18,4) not null default 0,     -- avg cost per base unit at posting
  returned_base_qty   numeric(18,4) not null default 0,
  unique (sale_id, line_no),
  foreign key (business_id, sale_id)    references sales(business_id, id) on delete restrict,
  foreign key (business_id, variant_id) references product_variants(business_id, id),
  foreign key (business_id, unit_id)    references units(business_id, id)
);

create table sale_line_batches (                            -- TBC Q-C02 (batch allocation)
  sale_line_id   uuid not null references sale_lines(id),
  batch_id       uuid not null,
  base_quantity  numeric(18,4) not null,
  primary key (sale_line_id, batch_id)
);

create table sale_payments (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null,
  sale_id            uuid not null,
  payment_method_id  uuid not null,
  amount             numeric(18,2) not null,                -- negative for refunds on void
  reference          text,
  cash_session_id    uuid,
  received_at        timestamptz not null,
  foreign key (business_id, sale_id)           references sales(business_id, id),
  foreign key (business_id, payment_method_id) references payment_methods(business_id, id)
);

create table sale_returns (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null,
  location_id       uuid not null,
  number            text not null,
  original_sale_id  uuid,                                    -- null only if no-receipt returns allowed (TBC Q-S03)
  customer_id       uuid,
  cash_session_id   uuid,
  status            doc_status not null default 'draft',
  reason_code_id    uuid,
  refund_total      numeric(18,2) not null default 0,
  processed_by      uuid not null references auth.users(id),
  approved_by       uuid references auth.users(id),
  posted_at         timestamptz,
  client_ref        uuid not null,
  note              text,
  created_at        timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  unique (business_id, client_ref),
  foreign key (business_id, original_sale_id) references sales(business_id, id)
);

create table sale_return_lines (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  sale_return_id  uuid not null,
  sale_line_id    uuid,
  variant_id      uuid not null,
  unit_id         uuid not null,
  quantity        numeric(18,4) not null check (quantity > 0),
  factor          numeric(18,6) not null,
  base_quantity   numeric(18,4) not null,
  unit_price      numeric(18,2) not null,
  tax_amount      numeric(18,2) not null default 0,
  refund_amount   numeric(18,2) not null,
  restock         boolean not null default true,             -- false → damage write-off
  unit_cost       numeric(18,4) not null,                    -- from original sale_line snapshot
  foreign key (business_id, sale_return_id) references sale_returns(business_id, id) on delete cascade
);

create table sale_return_refunds (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null,
  sale_return_id     uuid not null,
  payment_method_id  uuid not null,
  amount             numeric(18,2) not null check (amount > 0),
  reference          text,
  foreign key (business_id, sale_return_id) references sale_returns(business_id, id) on delete cascade
);
```

---

## 11. Receivables & payables *(TBC Q-F01, Q-F02)*

```sql
create table customer_account_entries (                 -- append-only sub-ledger
  id             bigint generated always as identity primary key,
  business_id    uuid not null,
  customer_id    uuid not null,
  entry_type     text not null check (entry_type in ('credit_sale','payment','refund','return_credit','adjustment','opening')),
  amount         numeric(18,2) not null,                  -- + increases what customer owes
  source_type    text not null,
  source_id      uuid not null,
  occurred_at    timestamptz not null,
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  foreign key (business_id, customer_id) references customers(business_id, id)
);

create table customer_payments (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null,
  customer_id        uuid not null,
  number             text not null,
  amount             numeric(18,2) not null check (amount > 0),
  payment_method_id  uuid not null,
  reference          text,
  cash_session_id    uuid,
  received_at        timestamptz not null,
  received_by        uuid not null references auth.users(id),
  unique (business_id, id),
  unique (business_id, number)
);

create table customer_payment_allocations (
  payment_id  uuid not null references customer_payments(id),
  sale_id     uuid not null references sales(id),
  amount      numeric(18,2) not null check (amount > 0),
  primary key (payment_id, sale_id)
);

-- Mirror structures for suppliers:
-- supplier_account_entries, supplier_payments, supplier_payment_allocations (→ goods_receipts)
```

---

## 12. Expenses *(optional module `expenses`, P3)*

```sql
create table expense_categories (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  parent_id    uuid,
  name         text not null,
  status       record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique nulls not distinct (business_id, parent_id, name)
);

create table expenses (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null,
  location_id        uuid,
  number             text not null,
  category_id        uuid not null,
  amount             numeric(18,2) not null check (amount > 0),
  tax_amount         numeric(18,2) not null default 0,
  payment_method_id  uuid,
  cash_session_id    uuid,                     -- if paid from a till
  payee              text,
  description        text,
  incurred_on        date not null,
  receipt_path       text,
  status             doc_status not null default 'draft',
  approved_by        uuid references auth.users(id),
  posted_at          timestamptz,
  …audit,
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, category_id) references expense_categories(business_id, id)
);
```

Note: `cash_movements.expense_id` is a plain nullable column (no FK) so the core cash module has no hard dependency on the Expenses module's table.

---

## 13. Accounting *(optional module `accounting`, P3)*

```sql
create table accounts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  code            text not null,
  name            text not null,
  type            account_type not null,
  parent_id       uuid,
  is_postable     boolean not null default true,     -- header accounts are not postable
  is_system       boolean not null default false,    -- seeded, cannot delete
  status          record_status not null default 'active',
  …audit,
  unique (business_id, id),
  unique (business_id, code),
  foreign key (business_id, parent_id) references accounts(business_id, id)
);

create table account_mappings (
  business_id  uuid not null,
  mapping_key  text not null,          -- 'sales_revenue','inventory','cogs','tax_output','tax_input',
                                       -- 'accounts_receivable','accounts_payable','inventory_loss',
                                       -- 'inventory_gain','cash_over_short','rounding',
                                       -- 'payment_method:<uuid>','expense_category:<uuid>'
  account_id   uuid not null,
  primary key (business_id, mapping_key),
  foreign key (business_id, account_id) references accounts(business_id, id)
);

create table fiscal_periods (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  name         text not null,
  starts_on    date not null,
  ends_on      date not null,
  status       period_status not null default 'open',
  unique (business_id, id),
  check (ends_on >= starts_on),
  exclude using gist (business_id with =, daterange(starts_on, ends_on, '[]') with &&)
);

create table journal_entries (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null,
  number             text not null,
  entry_date         date not null,
  period_id          uuid not null,
  source             text not null check (source in ('event','manual','opening','reversal')),
  source_event_id    uuid,                         -- business_events.id
  memo               text,
  status             journal_status not null default 'posted',
  reverses_entry_id  uuid,
  posted_by          uuid references auth.users(id),
  posted_at          timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  unique (business_id, source_event_id),           -- one journal per event (idempotent consumer)
  foreign key (business_id, period_id) references fiscal_periods(business_id, id)
);

create table journal_lines (
  id                bigint generated always as identity primary key,
  business_id       uuid not null,
  journal_entry_id  uuid not null,
  account_id        uuid not null,
  location_id       uuid,
  debit             numeric(18,2) not null default 0 check (debit  >= 0),
  credit            numeric(18,2) not null default 0 check (credit >= 0),
  description       text,
  check ((debit = 0) <> (credit = 0)),
  foreign key (business_id, journal_entry_id) references journal_entries(business_id, id),
  foreign key (business_id, account_id)       references accounts(business_id, id)
);
-- Deferred constraint trigger: SUM(debit) = SUM(credit) per journal_entry_id at commit.
```

### 13.1 Indicative event → journal mapping (to be confirmed by an accountant, Q-F05)

| Event | Debit | Credit |
|---|---|---|
| `sale.completed` | Cash/Bank per payment method (paid part); Accounts receivable (credit part) | Sales revenue (net); Tax output |
| ″ (cost) | Cost of goods sold | Inventory |
| `sale.voided` / `sale.returned` | Reverse of the above (restocked lines reverse COGS; non-restocked go to Inventory loss) | |
| `goods_receipt.posted` | Inventory; Tax input (if recoverable) | Accounts payable or Cash/Bank |
| `purchase_return.posted` | Accounts payable / Cash | Inventory |
| `stock.adjusted` (loss / gain) | Inventory loss / Inventory | Inventory / Inventory gain |
| `cash_session.closed` (variance) | Cash over/short | Cash (or reverse) |
| `expense.posted` | Expense category account | Cash/Bank per method |
| `customer_payment.received` | Cash/Bank | Accounts receivable |

---

## 14. Events, audit & attachments

```sql
create table business_events (                       -- transactional outbox (append-only)
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity unique,
  business_id     uuid not null references businesses(id),
  event_type      text not null,                     -- 'sale.completed','goods_receipt.posted',...
  event_version   smallint not null default 1,
  aggregate_type  text not null,
  aggregate_id    uuid not null,
  payload         jsonb not null,
  occurred_at     timestamptz not null,
  created_at      timestamptz not null default now()
);
create index be_business_seq on business_events (business_id, seq);

create table event_consumptions (
  event_id     uuid not null references business_events(id),
  consumer     text not null,                         -- 'accounting','notifications'
  status       consumption_status not null default 'pending',
  attempts     int not null default 0,
  last_error   text,
  processed_at timestamptz,
  primary key (event_id, consumer)
);
create index ec_pending on event_consumptions (consumer, status) where status in ('pending','failed');

create table audit_logs (
  id            bigint generated always as identity primary key,
  business_id   uuid,                                 -- null for platform-level actions
  actor_user_id uuid,
  on_behalf_of  uuid,                                 -- manager override: the authorising user
  action        text not null,                        -- 'price.changed','sale.voided','role.updated',...
  entity_type   text,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index al_business_time on audit_logs (business_id, created_at desc);

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  entity_type  text not null,
  entity_id    uuid not null,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   int not null check (size_bytes > 0),
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
```

---

## 15. Row-Level Security pattern

```sql
-- Helper functions (SECURITY DEFINER, STABLE, fixed search_path; indexed lookups)
create function app.is_member(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business and m.user_id = auth.uid() and m.status = 'active');
$$;

create function app.has_permission(p_business uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.business_members m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.business_id = p_business and m.user_id = auth.uid()
      and m.status = 'active' and rp.permission_code = p_perm);
$$;

create function app.can_access_location(p_business uuid, p_location uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business and m.user_id = auth.uid() and m.status = 'active'
      and (m.all_locations or exists (
            select 1 from public.member_locations ml
            where ml.member_id = m.id and ml.location_id = p_location)));
$$;

create function app.module_enabled(p_business uuid, p_module text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_enabled from public.business_modules
                   where business_id = p_business and module_code = p_module), false);
$$;

-- Example: master data (catalogue)
alter table products enable row level security;
create policy products_read   on products for select to authenticated
  using (app.is_member(business_id));
create policy products_insert on products for insert to authenticated
  with check (app.has_permission(business_id, 'catalog.product.create'));
create policy products_update on products for update to authenticated
  using (app.has_permission(business_id, 'catalog.product.update'))
  with check (app.has_permission(business_id, 'catalog.product.update'));
-- no delete policy: archive instead

-- Example: location-bound ledger (read-only to clients)
alter table stock_movements enable row level security;
create policy sm_read on stock_movements for select to authenticated
  using (app.has_permission(business_id, 'inventory.stock.view')
         and app.can_access_location(business_id, location_id));
revoke insert, update, delete on stock_movements from authenticated, anon;

-- Example: optional-module table
alter table journal_entries enable row level security;
create policy je_read on journal_entries for select to authenticated
  using (app.has_permission(business_id, 'accounting.journal.view'));
-- reads remain allowed when module disabled (read-only retention); writes only via functions that check module_enabled().
```

Policy performance: wrap helper calls as `(select app.is_member(business_id))` where the planner benefits, and index `business_members (user_id, business_id, status)`.

---

## 16. Posting functions (contracts)

All are `SECURITY DEFINER`, validate the caller with `app.has_permission`, verify every referenced ID belongs to `p_business`, run in one transaction, and emit one `business_events` row.

| Function | Effect |
|---|---|
| `app.post_sale(p_business, p_payload jsonb) → sales.id` | Idempotent on `client_ref`. Resolve/verify prices & tax, insert sale/lines/payments, lock & update `stock_levels`, insert `sale` movements at current avg cost, set cost snapshots, credit-sale ledger entry if applicable, emit `sale.completed`. Flags `needs_review` for offline conflicts. |
| `app.void_sale(p_business, p_sale_id, p_reason_id, p_authorised_by)` | Checks void window, inserts reversing movements (`sale_void`) and negative payments, marks sale voided, emits `sale.voided`. |
| `app.post_sale_return(p_business, p_payload)` | Validates quantities against `returned_base_qty`, restock → `sale_return` movement; non-restock → `sale_return` + `damage` pair; refunds; emits `sale.returned`. |
| `app.post_goods_receipt(p_business, p_grn_id)` | Creates/links batches, `purchase_receipt` movements, recomputes weighted average cost, updates PO received qty, emits `goods_receipt.posted`. |
| `app.post_purchase_return(...)` | `purchase_return` movements; emits `purchase_return.posted`. |
| `app.post_adjustment(p_business, p_adjustment_id)` | Approval threshold check; movements by kind; emits `stock.adjusted`. |
| `app.dispatch_transfer` / `app.receive_transfer` | `transfer_out` at source (avg cost carried), `transfer_in` at destination, variances as `count_variance`/adjustment; emits `stock.transferred`. |
| `app.post_stock_count(p_business, p_count_id)` | `count_variance` movements for non-zero variances; emits `stock.counted`. |
| `app.open_cash_session` / `app.close_cash_session` | Computes expected cash from payments and cash movements; stores variance; emits `cash_session.closed`. |
| `app.next_document_number(p_business, p_location, p_doc_type)` | Row-locked sequence increment. |
| `app.apply_stock_movement(...)` *(internal)* | The only code path that inserts into `stock_movements` and updates `stock_levels`/`batch_stock_levels`, applying the negative-stock policy and average-cost formula. |

Weighted average cost on receipt (per location/variant):
`new_avg = (max(on_hand,0) × old_avg + received_qty × received_unit_cost) / (max(on_hand,0) + received_qty)`; outbound movements use the current `avg_cost`. Handling when `on_hand` is negative is part of ADR-006.

---

## 17. Key indexes (beyond PK/unique)

| Table | Index |
|---|---|
| business_members | `(user_id, business_id, status)` |
| products | `(business_id, section_id, category_id, status)`; GIN `(attributes)`; GIN `(search_text)` |
| product_variants | `(business_id, product_id)`; GIN `(variant_attributes)`; trigram on `sku` |
| variant_barcodes | unique `(business_id, barcode)` |
| variant_prices | `(business_id, variant_id, price_list_id, effective_from desc)` |
| stock_movements | `(business_id, variant_id, location_id, occurred_at)`; `(business_id, source_type, source_id)`; `(business_id, occurred_at)` |
| sales | `(business_id, location_id, completed_at)`; `(business_id, customer_id)`; `(business_id, cash_session_id)` |
| sale_lines | `(business_id, variant_id)` |
| business_events | `(business_id, seq)` |
| inventory_batches | `(business_id, expiry_date)` |

## 18. Reporting views (initial)

| View / function | Purpose |
|---|---|
| `v_stock_on_hand` | stock_levels + product/variant/unit names + value |
| `v_low_stock` | on_hand ≤ reorder level (location override → variant default) |
| `fn_stock_card(business, variant, location, from, to)` | movements with running balance and source document numbers |
| `fn_sales_summary(business, location?, from, to, group_by)` | totals by day/cashier/method/category |
| `fn_gross_margin(business, from, to)` | revenue − (base_quantity × unit_cost_snapshot) − returns |
| `fn_inventory_valuation(business, as_of)` | Σ movements up to date × average cost reconstruction |
| `v_expiring_batches` | batch on hand with expiry within N days (TBC Q-C02) |
| `fn_cash_session_report(session)` | expected vs counted by method |

## 19. MVP schema scope (v0.2, from the owner's answers)

| Item | MVP treatment |
|---|---|
| `inventory_batches`, `batch_stock_levels`, `sale_line_batches` | **Not created** (no batches/expiry). `products.track_batches/track_expiry` kept, default false, hidden. |
| `sale_returns`, `sale_return_lines`, `sale_return_refunds` | **Not created** (no returns). `sale_void` movement type and void columns on `sales` kept unused — needed if doc 12 Q3 = owner-only cancel. |
| `stock_transfers`, `stock_transfer_lines` | **Not created** (one shop). |
| `variant_prices.location_id`, `min_quantity` | Kept; always null / 1 in MVP. |
| `price_lists` | One row: "Standard". `customers.price_list_id` unused. |
| `tax_rates` | Created, empty; `sale_lines.tax_*` always 0. |
| `customer_account_entries`, `customer_payments`, `customer_payment_allocations` | **Created** (credit sales in MVP). |
| `supplier_*` payables tables | Not created. |
| `expense_*`, accounting tables | Not created until Phase 3. |
| `units.allows_decimal` | False for all pilot units. |

## 20. v0.3 changes (Prompt Collection reconciliation, doc 12 §5)

- **`sections`** added; `categories.section_id` required; `products.section_id` required with a composite FK guaranteeing the category is in the same section.
- **`stock_movements.balance_before / balance_after`** added, set by `app.apply_stock_movement` under the row lock; a check `balance_after = balance_before + quantity` is enforced.
- **Cancellation (owner-only, same day)** uses the existing void path: `sales.status` adds `'cancelled'` (rename of `voided`), `sale_void` movements and negative `sale_payments`. `sale_returns*` tables are created in Stage 9 but the feature is off for the pilot (`settings.returns_enabled = false`).
- Credit: `customer_payments` gets `client_ref uuid unique` per business to prevent duplicate repayments; `sales.credit_due_on date` (optional due date).
- **Optional-module tables** (sales, purchasing, suppliers, customers, credit, expenses, accounting) are created regardless of enablement; RLS write policies and posting functions check `app.module_enabled(...)`. Disabling hides and blocks, never deletes.
