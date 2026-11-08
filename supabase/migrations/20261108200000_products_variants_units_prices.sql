-- =============================================================================
-- Stage 6 — Products, variants, units and prices
--
--   units            per-business units of measure (piece, carton, kg…); seeded
--   products         belongs to a section (and optionally a category in that section)
--   product_variants the sellable, stock-keeping versions (e.g. White / L); every
--                    product has at least one
--   product_units    which units a product is counted, bought and sold in, with
--                    conversion factors to its base unit (1 carton = 24 pieces)
--   variant_prices   selling price history per variant and unit (never overwritten)
--   variant_costs    cost price history per variant, per base unit (hidden from
--                    people without inventory.cost.view)
--
-- Plain-language rules:
--   * Stock will always be counted in the product's base unit (Stage 7).
--   * A price change closes the old price and adds a new one, so history and
--     past sales are never changed.
--   * Nothing is deleted: products, variants, units are archived and restored.
--   * Moving a category to another section moves its products with it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create function app.can_view_catalog(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission(p_business, 'catalog.product.view')
      or app.has_permission(p_business, 'catalog.product.manage')
      or app.has_permission(p_business, 'catalog.section.manage');
$$;
revoke all on function app.can_view_catalog(uuid) from public;
grant execute on function app.can_view_catalog(uuid) to authenticated, service_role;

-- created_by / archived_at / archived_by bookkeeping for tables without a name column.
create function app.archivable_housekeeping()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    if new.business_id <> old.business_id then
      raise exception 'Records cannot be moved to another business' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.status = 'archived' and (tg_op = 'INSERT' or old.status <> 'archived') then
    new.archived_at := now();
    new.archived_by := (select auth.uid());
  elsif new.status = 'active' then
    new.archived_at := null;
    new.archived_by := null;
  else
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Units of measure
-- -----------------------------------------------------------------------------
create table public.units (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id),
  -- Short symbol shown next to quantities: "pc", "ctn", "kg".
  code            text not null check (code ~ '^[a-z][a-z0-9]{0,11}$'),
  name            text not null check (char_length(name) between 1 and 40),
  kind            text not null default 'count'
                    check (kind in ('count', 'mass', 'volume', 'length', 'other')),
  -- Whether quantities in this unit may have decimals (1.25 kg) or must be whole (3 pieces).
  allows_decimal  boolean not null default false,
  status          public.record_status not null default 'active'
                    check (status in ('active', 'archived')),
  archived_at     timestamptz,
  archived_by     uuid references auth.users (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, code),
  check ((status = 'archived') = (archived_at is not null))
);
create unique index units_business_name_key on public.units (business_id, lower(name));

create function app.tidy_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.code := lower(btrim(new.code));
  if tg_op = 'UPDATE' and (new.code <> old.code or new.allows_decimal <> old.allows_decimal)
     and exists (select 1 from public.product_units pu where pu.unit_id = old.id) then
    raise exception 'This unit is used by products; its symbol and decimal setting can no longer change'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger units_tidy before insert or update on public.units
  for each row execute function app.tidy_unit();
create trigger units_housekeeping before insert or update on public.units
  for each row execute function app.archivable_housekeeping();
create trigger units_set_updated_at before update on public.units
  for each row execute function app.set_updated_at();
create trigger audit_units after insert or update or delete on public.units
  for each row execute function app.audit_row_change();

-- Every business starts with common units (it can add its own or archive these).
create function app.seed_business_units(p_business uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.units (business_id, code, name, kind, allows_decimal)
  values
    (p_business, 'pc',    'Piece',      'count',  false),
    (p_business, 'pack',  'Pack',       'count',  false),
    (p_business, 'ctn',   'Carton',     'count',  false),
    (p_business, 'crate', 'Crate',      'count',  false),
    (p_business, 'bag',   'Bag',        'count',  false),
    (p_business, 'dz',    'Dozen',      'count',  false),
    (p_business, 'kg',    'Kilogram',   'mass',   true),
    (p_business, 'g',     'Gram',       'mass',   false),
    (p_business, 'l',     'Litre',      'volume', true),
    (p_business, 'ml',    'Millilitre', 'volume', false),
    (p_business, 'm',     'Metre',      'length', true),
    (p_business, 'yd',    'Yard',       'length', true)
  on conflict (business_id, code) do nothing;
$$;
revoke all on function app.seed_business_units(uuid) from public;

create function app.on_business_created_seed_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.seed_business_units(new.id);
  return null;
end;
$$;
revoke all on function app.on_business_created_seed_units() from public;

create trigger businesses_seed_units after insert on public.businesses
  for each row execute function app.on_business_created_seed_units();

-- Existing businesses get the same units.
select app.seed_business_units(id) from public.businesses;

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id),
  section_id    uuid not null,
  category_id   uuid,
  name          text not null check (char_length(name) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 1000),
  brand         text not null default '' check (char_length(brand) <= 60),
  -- The unit stock is counted in. Fixed once the product exists.
  base_unit_id  uuid not null,
  -- Names of the variant options, e.g. {Size, Colour}. Up to 3.
  option_names  text[] not null default '{}' check (cardinality(option_names) <= 3),
  -- Storage path of the main image ("<business>/<product>/<file>"); set by the server.
  image_path    text check (image_path is null or char_length(image_path) <= 300),
  status        public.record_status not null default 'active'
                  check (status in ('active', 'archived')),
  archived_at   timestamptz,
  archived_by   uuid references auth.users (id) on delete set null,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, section_id) references public.sections (business_id, id),
  -- The category must be in the product's section. ON UPDATE CASCADE: when a
  -- category moves to another section, its products move with it.
  foreign key (business_id, section_id, category_id)
    references public.categories (business_id, section_id, id) on update cascade,
  foreign key (business_id, base_unit_id) references public.units (business_id, id),
  check ((status = 'archived') = (archived_at is not null))
);

create index products_business_section_idx on public.products (business_id, section_id, category_id, status);
create index products_business_name_idx on public.products (business_id, lower(name));

create function app.validate_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
  v_name  text;
begin
  new.brand := regexp_replace(btrim(new.brand), '\s+', ' ', 'g');

  -- Option names: tidy, non-empty, unique ignoring capitals.
  v_names := '{}';
  foreach v_name in array new.option_names loop
    v_name := regexp_replace(btrim(v_name), '\s+', ' ', 'g');
    if v_name = '' or char_length(v_name) > 30 then
      raise exception 'Option names must be 1 to 30 characters' using errcode = '23514';
    end if;
    if lower(v_name) = any (select lower(x) from unnest(v_names) as x) then
      raise exception 'Option "%" is listed twice', v_name using errcode = '23514';
    end if;
    v_names := v_names || v_name;
  end loop;
  new.option_names := v_names;

  if tg_op = 'UPDATE' then
    if new.base_unit_id <> old.base_unit_id then
      raise exception 'The base unit of a product cannot be changed' using errcode = '22023';
    end if;
    if cardinality(new.option_names) <> cardinality(old.option_names)
       and exists (select 1 from public.product_variants v where v.product_id = old.id) then
      raise exception 'Options can be renamed, but not added or removed, once variants exist'
        using errcode = '22023';
    end if;
  end if;

  -- New products, or products moved by a person, must use active sections and categories.
  -- (A move caused by moving the category keeps category_id and is always allowed.)
  if tg_op = 'INSERT'
     or new.category_id is distinct from old.category_id
     or (new.category_id is null and new.section_id <> old.section_id) then
    if exists (select 1 from public.sections s
               where s.business_id = new.business_id and s.id = new.section_id and s.status = 'archived') then
      raise exception 'This section is archived. Choose an active section.' using errcode = '22023';
    end if;
    if new.category_id is not null and exists (
         select 1 from public.categories c
         where c.business_id = new.business_id and c.id = new.category_id and c.status = 'archived') then
      raise exception 'This category is archived. Choose an active category.' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'INSERT' and exists (
       select 1 from public.units u
       where u.business_id = new.business_id and u.id = new.base_unit_id and u.status = 'archived') then
    raise exception 'This unit is archived. Choose an active unit.' using errcode = '22023';
  end if;

  return new;
end;
$$;
revoke all on function app.validate_product() from public;

create trigger products_housekeeping before insert or update on public.products
  for each row execute function app.catalog_row_housekeeping();
create trigger products_validate before insert or update on public.products
  for each row execute function app.validate_product();
create trigger products_set_updated_at before update on public.products
  for each row execute function app.set_updated_at();
create trigger audit_products after insert or update or delete on public.products
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Product units (base unit + extra units with conversion factors)
-- -----------------------------------------------------------------------------
create table public.product_units (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null,
  product_id   uuid not null,
  unit_id      uuid not null,
  -- How many base units one of this unit contains: Carton → 24 (pieces).
  factor       numeric(18, 6) not null check (factor > 0),
  is_base      boolean not null default false,
  status       public.record_status not null default 'active'
                 check (status in ('active', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, id),
  unique (product_id, unit_id),
  foreign key (business_id, product_id) references public.products (business_id, id),
  foreign key (business_id, unit_id) references public.units (business_id, id),
  check (not is_base or factor = 1)
);
create unique index product_units_one_base on public.product_units (product_id) where is_base;
create index product_units_business_idx on public.product_units (business_id, product_id);

create function app.validate_product_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_base_decimal boolean;
begin
  select * into v_product from public.products
  where business_id = new.business_id and id = new.product_id;

  if tg_op = 'UPDATE' then
    if new.unit_id <> old.unit_id or new.product_id <> old.product_id then
      raise exception 'Add a new unit instead of changing this one' using errcode = '22023';
    end if;
    if old.is_base and (new.factor <> old.factor or new.status <> 'active' or not new.is_base) then
      raise exception 'The base unit of a product cannot be changed or archived' using errcode = '22023';
    end if;
    new.is_base := old.is_base;
  else
    if v_product.status = 'archived' then
      raise exception 'Restore this product before adding units' using errcode = '22023';
    end if;
    if exists (select 1 from public.units u where u.id = new.unit_id and u.status = 'archived') then
      raise exception 'This unit is archived. Choose an active unit.' using errcode = '22023';
    end if;
    new.is_base := (new.unit_id = v_product.base_unit_id);
    if new.is_base then
      new.factor := 1;
    end if;
  end if;

  if not new.is_base then
    select allows_decimal into v_base_decimal from public.units where id = v_product.base_unit_id;
    if not v_base_decimal and new.factor <> trunc(new.factor) then
      raise exception 'The base unit is counted in whole numbers, so this unit must contain a whole number of them'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.validate_product_unit() from public;

create trigger product_units_validate before insert or update on public.product_units
  for each row execute function app.validate_product_unit();
create trigger product_units_set_updated_at before update on public.product_units
  for each row execute function app.set_updated_at();
create trigger audit_product_units after insert or update or delete on public.product_units
  for each row execute function app.audit_row_change();

-- Every product automatically gets its base unit (factor 1).
create function app.add_base_product_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_units (business_id, product_id, unit_id, factor)
  values (new.business_id, new.id, new.base_unit_id, 1);
  return null;
end;
$$;
revoke all on function app.add_base_product_unit() from public;

create trigger products_add_base_unit after insert on public.products
  for each row execute function app.add_base_product_unit();

-- -----------------------------------------------------------------------------
-- Variants
-- -----------------------------------------------------------------------------
create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null,
  product_id       uuid not null,
  sku              text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  barcode          text check (barcode is null or barcode ~ '^[A-Za-z0-9-]{4,32}$'),
  -- Values matching products.option_names in the same order, e.g. {L, White}.
  option_values    text[] not null default '{}',
  -- Alert when stock (in base units) falls to this level. Used from Stage 7.
  min_stock_level  numeric(18, 4) not null default 0 check (min_stock_level >= 0),
  status           public.record_status not null default 'active'
                     check (status in ('active', 'archived')),
  archived_at      timestamptz,
  archived_by      uuid references auth.users (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, product_id) references public.products (business_id, id),
  check ((status = 'archived') = (archived_at is not null))
);
create unique index product_variants_business_sku_key on public.product_variants (business_id, upper(sku));
create unique index product_variants_business_barcode_key on public.product_variants (business_id, barcode)
  where barcode is not null;
-- "M / White" and "m / white" are the same variant: compare option values
-- ignoring capitals (the values themselves are stored as typed).
create function app.option_values_key(p_values text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(lower(v), chr(31) order by o), '')
  from unnest(p_values) with ordinality as t(v, o)
$$;
comment on function app.option_values_key(text[]) is
  'Case-insensitive key of a variant''s option values (used by the uniqueness rule).';
create unique index product_variants_product_options_key
  on public.product_variants (product_id, app.option_values_key(option_values));
create index product_variants_business_product_idx on public.product_variants (business_id, product_id, status);

create function app.validate_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_value   text;
  v_values  text[] := '{}';
  v_decimal boolean;
begin
  select * into v_product from public.products
  where business_id = new.business_id and id = new.product_id;

  if tg_op = 'UPDATE' and new.product_id <> old.product_id then
    raise exception 'A variant cannot be moved to another product' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and v_product.status = 'archived' then
    raise exception 'Restore this product before adding variants' using errcode = '22023';
  end if;

  new.sku := btrim(new.sku);
  new.barcode := nullif(btrim(coalesce(new.barcode, '')), '');

  if cardinality(new.option_values) <> cardinality(v_product.option_names) then
    raise exception 'Give a value for each option (%)', array_to_string(v_product.option_names, ', ')
      using errcode = '23514';
  end if;
  foreach v_value in array new.option_values loop
    v_value := regexp_replace(btrim(v_value), '\s+', ' ', 'g');
    if v_value = '' or char_length(v_value) > 30 then
      raise exception 'Option values must be 1 to 30 characters' using errcode = '23514';
    end if;
    v_values := v_values || v_value;
  end loop;
  new.option_values := v_values;

  select u.allows_decimal into v_decimal from public.units u where u.id = v_product.base_unit_id;
  if not v_decimal and new.min_stock_level <> trunc(new.min_stock_level) then
    raise exception 'The minimum stock level must be a whole number for this unit' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function app.validate_variant() from public;

create trigger product_variants_validate before insert or update on public.product_variants
  for each row execute function app.validate_variant();
create trigger product_variants_housekeeping before insert or update on public.product_variants
  for each row execute function app.archivable_housekeeping();
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function app.set_updated_at();
create trigger audit_product_variants after insert or update or delete on public.product_variants
  for each row execute function app.audit_row_change();

-- Every product must have at least one variant (checked when the change is saved).
create function app.ensure_product_has_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.product_variants v where v.product_id = new.id) then
    raise exception 'A product needs at least one variant' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function app.ensure_product_has_variant() from public;

create constraint trigger products_have_variant
  after insert on public.products
  deferrable initially deferred
  for each row execute function app.ensure_product_has_variant();

-- -----------------------------------------------------------------------------
-- Selling prices and cost prices (append-only history)
-- -----------------------------------------------------------------------------
create table public.variant_prices (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  variant_id      uuid not null,
  unit_id         uuid not null,
  price           numeric(18, 2) not null check (price >= 0),
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,                -- null = current price
  set_by          uuid references auth.users (id) on delete set null,
  unique (business_id, id),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id),
  foreign key (business_id, unit_id) references public.units (business_id, id),
  check (effective_to is null or effective_to >= effective_from)
);
-- Exactly one current price per variant and unit.
create unique index variant_prices_current_key on public.variant_prices (variant_id, unit_id)
  where effective_to is null;
create index variant_prices_business_variant_idx
  on public.variant_prices (business_id, variant_id, effective_from desc);

create table public.variant_costs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  variant_id      uuid not null,
  -- Cost of ONE base unit. Stage 7/10 will add the average cost from real purchases.
  cost            numeric(18, 4) not null check (cost >= 0),
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  set_by          uuid references auth.users (id) on delete set null,
  unique (business_id, id),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index variant_costs_current_key on public.variant_costs (variant_id) where effective_to is null;
create index variant_costs_business_variant_idx
  on public.variant_costs (business_id, variant_id, effective_from desc);

comment on table public.variant_prices is
  'Selling price history. Written only by set_variant_price(); old rows are closed, never changed.';
comment on table public.variant_costs is
  'Cost price history (per base unit). Written only by set_variant_cost(). Visible with inventory.cost.view.';

-- Sets the selling price of a variant in one of its product's units.
create function public.set_variant_price(p_variant uuid, p_unit uuid, p_price numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants;
  v_current public.variant_prices;
begin
  select * into v_variant from public.product_variants where id = p_variant;
  if not found or not app.has_permission(v_variant.business_id, 'pricing.price.update') then
    raise exception 'You do not have permission to change prices' using errcode = '42501';
  end if;
  if p_price is null or p_price < 0 or p_price <> round(p_price, 2) then
    raise exception 'Enter a price of zero or more, with at most 2 decimal places' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.product_units pu
    where pu.business_id = v_variant.business_id and pu.product_id = v_variant.product_id
      and pu.unit_id = p_unit and pu.status = 'active'
  ) then
    raise exception 'This product is not sold in that unit' using errcode = '22023';
  end if;

  select * into v_current from public.variant_prices
  where variant_id = p_variant and unit_id = p_unit and effective_to is null
  for update;

  if found and v_current.price = p_price then
    return;  -- unchanged: no new history entry
  end if;
  if found then
    update public.variant_prices set effective_to = now() where id = v_current.id;
  end if;
  insert into public.variant_prices (business_id, variant_id, unit_id, price, set_by)
  values (v_variant.business_id, p_variant, p_unit, p_price, (select auth.uid()));
end;
$$;

-- Sets the cost price (per base unit) of a variant.
create function public.set_variant_cost(p_variant uuid, p_cost numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants;
  v_current public.variant_costs;
begin
  select * into v_variant from public.product_variants where id = p_variant;
  if not found
     or not app.has_permission(v_variant.business_id, 'pricing.price.update')
     or not app.has_permission(v_variant.business_id, 'inventory.cost.view') then
    raise exception 'You do not have permission to change cost prices' using errcode = '42501';
  end if;
  if p_cost is null or p_cost < 0 or p_cost <> round(p_cost, 4) then
    raise exception 'Enter a cost of zero or more, with at most 4 decimal places' using errcode = '22023';
  end if;

  select * into v_current from public.variant_costs
  where variant_id = p_variant and effective_to is null
  for update;

  if found and v_current.cost = p_cost then
    return;
  end if;
  if found then
    update public.variant_costs set effective_to = now() where id = v_current.id;
  end if;
  insert into public.variant_costs (business_id, variant_id, cost, set_by)
  values (v_variant.business_id, p_variant, p_cost, (select auth.uid()));
end;
$$;

-- -----------------------------------------------------------------------------
-- Creating a product with its units, variants and prices in one step
-- (runs as the caller, so every Row-Level Security rule applies).
-- -----------------------------------------------------------------------------
create function app.insert_variant(p_business uuid, p_product uuid, p_variant jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id    uuid;
  v_price jsonb;
begin
  insert into public.product_variants (business_id, product_id, sku, barcode, option_values, min_stock_level)
  values (
    p_business,
    p_product,
    p_variant ->> 'sku',
    p_variant ->> 'barcode',
    coalesce(array(select jsonb_array_elements_text(p_variant -> 'option_values')), '{}'),
    coalesce(nullif(p_variant ->> 'min_stock_level', '')::numeric, 0)
  )
  returning id into v_id;

  for v_price in select * from jsonb_array_elements(coalesce(p_variant -> 'prices', '[]'::jsonb)) loop
    perform public.set_variant_price(v_id, (v_price ->> 'unit_id')::uuid, (v_price ->> 'price')::numeric);
  end loop;

  if nullif(p_variant ->> 'cost', '') is not null then
    perform public.set_variant_cost(v_id, (p_variant ->> 'cost')::numeric);
  end if;
  return v_id;
end;
$$;

create function public.create_product(p_business uuid, p_product jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_product uuid;
  v_unit    jsonb;
  v_variant jsonb;
begin
  if jsonb_array_length(coalesce(p_product -> 'variants', '[]'::jsonb)) = 0 then
    raise exception 'A product needs at least one variant' using errcode = '23514';
  end if;
  if jsonb_array_length(p_product -> 'variants') > 200 then
    raise exception 'A product can have at most 200 variants' using errcode = '23514';
  end if;

  insert into public.products (business_id, section_id, category_id, name, description, brand,
                               base_unit_id, option_names)
  values (
    p_business,
    (p_product ->> 'section_id')::uuid,
    nullif(p_product ->> 'category_id', '')::uuid,
    p_product ->> 'name',
    coalesce(p_product ->> 'description', ''),
    coalesce(p_product ->> 'brand', ''),
    (p_product ->> 'base_unit_id')::uuid,
    coalesce(array(select jsonb_array_elements_text(p_product -> 'option_names')), '{}')
  )
  returning id into v_product;

  for v_unit in select * from jsonb_array_elements(coalesce(p_product -> 'units', '[]'::jsonb)) loop
    insert into public.product_units (business_id, product_id, unit_id, factor)
    values (p_business, v_product, (v_unit ->> 'unit_id')::uuid, (v_unit ->> 'factor')::numeric);
  end loop;

  for v_variant in select * from jsonb_array_elements(p_product -> 'variants') loop
    perform app.insert_variant(p_business, v_product, v_variant);
  end loop;

  return v_product;
end;
$$;

-- Adds one variant (with optional prices and cost) to an existing product.
create function public.add_product_variant(p_product uuid, p_variant jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.products where id = p_product;
  if v_business is null then
    raise exception 'Product not found' using errcode = '42501';
  end if;
  return app.insert_variant(v_business, p_product, p_variant);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges and Row-Level Security
-- -----------------------------------------------------------------------------
revoke all on public.units, public.products, public.product_variants, public.product_units,
  public.variant_prices, public.variant_costs from anon, authenticated;
-- Archive instead of delete; prices and costs only through their functions.
grant select, insert, update on public.units, public.products, public.product_variants,
  public.product_units to authenticated;
grant select on public.variant_prices, public.variant_costs to authenticated;

revoke all on function
  public.set_variant_price(uuid, uuid, numeric),
  public.set_variant_cost(uuid, numeric),
  public.create_product(uuid, jsonb),
  public.add_product_variant(uuid, jsonb),
  app.insert_variant(uuid, uuid, jsonb)
from public, anon;
grant execute on function
  public.set_variant_price(uuid, uuid, numeric),
  public.set_variant_cost(uuid, numeric),
  public.create_product(uuid, jsonb),
  public.add_product_variant(uuid, jsonb),
  app.insert_variant(uuid, uuid, jsonb)
to authenticated;

alter table public.units enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_units enable row level security;
alter table public.variant_prices enable row level security;
alter table public.variant_costs enable row level security;

create policy units_read on public.units for select to authenticated
  using (app.can_view_catalog(business_id));
create policy units_insert on public.units for insert to authenticated
  with check (app.has_permission(business_id, 'catalog.product.manage'));
create policy units_update on public.units for update to authenticated
  using (app.has_permission(business_id, 'catalog.product.manage'))
  with check (app.has_permission(business_id, 'catalog.product.manage'));

create policy products_read on public.products for select to authenticated
  using (app.can_view_catalog(business_id));
create policy products_insert on public.products for insert to authenticated
  with check (app.has_permission(business_id, 'catalog.product.manage'));
create policy products_update on public.products for update to authenticated
  using (app.has_permission(business_id, 'catalog.product.manage'))
  with check (app.has_permission(business_id, 'catalog.product.manage'));

create policy product_variants_read on public.product_variants for select to authenticated
  using (app.can_view_catalog(business_id));
create policy product_variants_insert on public.product_variants for insert to authenticated
  with check (app.has_permission(business_id, 'catalog.product.manage'));
create policy product_variants_update on public.product_variants for update to authenticated
  using (app.has_permission(business_id, 'catalog.product.manage'))
  with check (app.has_permission(business_id, 'catalog.product.manage'));

create policy product_units_read on public.product_units for select to authenticated
  using (app.can_view_catalog(business_id));
create policy product_units_insert on public.product_units for insert to authenticated
  with check (app.has_permission(business_id, 'catalog.product.manage'));
create policy product_units_update on public.product_units for update to authenticated
  using (app.has_permission(business_id, 'catalog.product.manage'))
  with check (app.has_permission(business_id, 'catalog.product.manage'));

create policy variant_prices_read on public.variant_prices for select to authenticated
  using (
    app.has_permission(business_id, 'pricing.price.view')
    or app.has_permission(business_id, 'pricing.price.update')
  );

create policy variant_costs_read on public.variant_costs for select to authenticated
  using (app.has_permission(business_id, 'inventory.cost.view'));
