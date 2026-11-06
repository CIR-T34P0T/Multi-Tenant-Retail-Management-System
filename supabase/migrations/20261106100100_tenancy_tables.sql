-- =============================================================================
-- Stage 3 · Migration 2 of 5 — Tenancy tables
--
-- Platform reference data (same for every business):
--   modules, permissions, role_templates, role_template_permissions
-- Per-business data (every row carries business_id):
--   businesses, roles, role_permissions, business_members,
--   business_settings, business_modules
-- Per-person data:
--   profiles (1:1 with auth.users)
--
-- Tenant-safety pattern used here and in every later business table:
--   * business_id NOT NULL
--   * UNIQUE (business_id, id) on the parent
--   * child references use a COMPOSITE foreign key (business_id, parent_id),
--     so a row can never point at another business's row — even through a bug.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Platform reference data
-- -----------------------------------------------------------------------------
create table public.modules (
  code        text primary key check (code ~ '^[a-z][a-z_]*$'),
  name        text not null,
  is_core     boolean not null,
  requires    text[] not null default '{}',   -- module codes that must be enabled first
  sort_order  int not null default 0
);
comment on table public.modules is
  'Module registry. Must match src/modules/registry.ts (checked by a unit test).';

create table public.permissions (
  code         text primary key check (code ~ '^[a-z_]+\.[a-z_]+\.[a-z_]+$'),
  module_code  text not null references public.modules (code),
  description  text not null,
  is_sensitive boolean not null default false
);
comment on table public.permissions is
  'Permission catalogue (module.resource.action). Sensitive ones are audited and owner-controlled.';

create table public.role_templates (
  key          text primary key check (key ~ '^[a-z_]+$'),
  name         text not null,
  description  text not null,
  is_owner     boolean not null default false,
  sort_order   int not null default 0
);

create table public.role_template_permissions (
  template_key    text not null references public.role_templates (key) on delete cascade,
  permission_code text not null references public.permissions (code),
  primary key (template_key, permission_code)
);

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone       text check (phone is null or char_length(phone) <= 32),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

-- Create a profile automatically when someone signs up.
create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function app.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- -----------------------------------------------------------------------------
-- Businesses
-- -----------------------------------------------------------------------------
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 2 and 120),
  -- URL-friendly unique name: lowercase letters, digits, hyphens; 3–48 characters.
  slug          text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  legal_name    text check (legal_name is null or char_length(legal_name) <= 200),
  email         text check (email is null or char_length(email) <= 254),
  phone         text check (phone is null or char_length(phone) <= 32),
  address       text check (address is null or char_length(address) <= 500),
  country_code  char(2) not null default 'NG' check (country_code ~ '^[A-Z]{2}$'),
  currency_code char(3) not null default 'NGN' check (currency_code ~ '^[A-Z]{3}$'),
  timezone      text not null default 'Africa/Lagos',
  status        text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index businesses_slug_key on public.businesses (slug);

-- Reject unknown time zones (a CHECK constraint cannot look this up).
create function app.validate_business()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

create trigger businesses_validate
  before insert or update of timezone, name on public.businesses
  for each row execute function app.validate_business();

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Roles and their permissions (per business; copied from templates)
-- -----------------------------------------------------------------------------
create table public.roles (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id),
  key           text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name          text not null check (char_length(btrim(name)) between 2 and 60),
  description   text not null default '',
  -- The owner role implicitly has every permission and cannot be edited.
  is_owner      boolean not null default false,
  template_key  text references public.role_templates (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, key)
);

-- Exactly one owner role per business.
create unique index roles_one_owner_per_business on public.roles (business_id) where is_owner;

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function app.set_updated_at();

create table public.role_permissions (
  business_id     uuid not null,
  role_id         uuid not null,
  permission_code text not null references public.permissions (code),
  primary key (role_id, permission_code),
  foreign key (business_id, role_id) references public.roles (business_id, id) on delete cascade
);

create index role_permissions_business_idx on public.role_permissions (business_id, role_id);

-- -----------------------------------------------------------------------------
-- Business members (owner and attendants)
-- -----------------------------------------------------------------------------
create table public.business_members (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id),
  user_id        uuid references auth.users (id) on delete cascade,  -- null while an invitation is pending (Stage 4)
  invited_email  text check (invited_email is null or char_length(invited_email) <= 254),
  role_id        uuid not null,
  status         public.member_status not null default 'active',
  invited_by     uuid references auth.users (id) on delete set null,
  joined_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, user_id),
  foreign key (business_id, role_id) references public.roles (business_id, id),
  check (user_id is not null or invited_email is not null),
  check (status = 'invited' or user_id is not null)
);

-- Fast "is this user a member of this business?" lookups used by every security check.
create index business_members_user_idx on public.business_members (user_id, business_id, status);
create index business_members_role_idx on public.business_members (business_id, role_id);

create trigger business_members_set_updated_at
  before update on public.business_members
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Business settings (one row per business)
-- -----------------------------------------------------------------------------
create table public.business_settings (
  business_id               uuid primary key references public.businesses (id),
  allow_negative_stock      boolean not null default false,
  returns_enabled           boolean not null default false,
  require_customer_on_sale  boolean not null default false,
  max_discount_percent      numeric(5, 2) not null default 0 check (max_discount_percent between 0 and 100),
  cash_rounding_increment   numeric(18, 2) not null default 0 check (cash_rounding_increment >= 0),
  low_stock_alerts_enabled  boolean not null default true,
  receipt_header            text not null default '' check (char_length(receipt_header) <= 500),
  receipt_footer            text not null default '' check (char_length(receipt_footer) <= 500),
  -- Room for minor future settings without a migration; validated by the app.
  extra                     jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  updated_at                timestamptz not null default now(),
  updated_by                uuid references auth.users (id) on delete set null
);

create trigger business_settings_set_updated_at
  before update on public.business_settings
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Business modules (optional modules switched on/off per business)
-- -----------------------------------------------------------------------------
create table public.business_modules (
  business_id  uuid not null references public.businesses (id),
  module_code  text not null references public.modules (code),
  is_enabled   boolean not null default false,
  enabled_at   timestamptz,
  disabled_at  timestamptz,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (business_id, module_code)
);

-- Only optional modules have rows; core modules are always on.
create function app.business_modules_only_optional()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select is_core from public.modules where code = new.module_code) then
    raise exception 'Module % is a core module and is always enabled', new.module_code
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger business_modules_only_optional
  before insert or update of module_code on public.business_modules
  for each row execute function app.business_modules_only_optional();

create trigger business_modules_set_updated_at
  before update on public.business_modules
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit triggers on sensitive tables
-- -----------------------------------------------------------------------------
create trigger audit_businesses after insert or update or delete on public.businesses
  for each row execute function app.audit_row_change();
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function app.audit_row_change();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function app.audit_row_change();
create trigger audit_business_members after insert or update or delete on public.business_members
  for each row execute function app.audit_row_change();
create trigger audit_business_settings after insert or update or delete on public.business_settings
  for each row execute function app.audit_row_change();
create trigger audit_business_modules after insert or update or delete on public.business_modules
  for each row execute function app.audit_row_change();
