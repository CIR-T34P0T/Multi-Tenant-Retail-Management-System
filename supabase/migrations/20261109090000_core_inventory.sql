-- =============================================================================
-- Stage 7 — Core inventory
--
--   stock_levels       current quantity of every variant (in its base unit);
--                      one row per variant, created automatically
--   stock_movements    the stock ledger: every change, with the balance before
--                      and after, who, when and why. Never changed or deleted.
--   stock_counts       physical stock counts (stocktakes)
--   stock_count_lines  the items in a count and what was found on the shelf
--
-- Plain-language rules:
--   * Stock only changes through a movement, written by the functions below in
--     the same transaction as the new balance. Nobody can edit the tables.
--   * Each item's balance is locked while it changes, so two people deducting
--     at the same moment can never lose an update.
--   * Going below zero is refused unless the business allows negative stock
--     (Settings); even then the person must confirm.
--   * Works with every optional module switched off.
--   * One shop: there is no location column yet (docs/12 §1 Q-B02).
-- =============================================================================

create type public.stock_movement_type as enum (
  'opening',      -- first stock recorded for an item
  'stock_in',     -- added by hand (e.g. a delivery, found stock)
  'stock_out',    -- deducted by hand (e.g. used in the shop, correction)
  'damaged',      -- write-offs: always reduce stock
  'expired',
  'missing',
  'written_off',
  'count'         -- difference found by a stock count (+ or −)
);
comment on type public.stock_movement_type is
  'Why stock changed. Later stages add sale, purchase and cancellation types.';

-- -----------------------------------------------------------------------------
-- Current balances
-- -----------------------------------------------------------------------------
create table public.stock_levels (
  business_id       uuid not null,
  variant_id        uuid primary key,
  on_hand           numeric(18, 4) not null default 0,
  movement_count    bigint not null default 0 check (movement_count >= 0),
  last_movement_at  timestamptz,
  updated_at        timestamptz not null default now(),
  unique (business_id, variant_id),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id)
);
comment on table public.stock_levels is
  'Current stock per variant, in the product''s base unit. Written only by app.apply_stock_movement.';

create function app.create_stock_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (business_id, variant_id) values (new.business_id, new.id);
  return new;
end;
$$;
revoke all on function app.create_stock_level() from public;

create trigger product_variants_create_stock_level
  after insert on public.product_variants
  for each row execute function app.create_stock_level();

insert into public.stock_levels (business_id, variant_id)
select business_id, id from public.product_variants;

-- -----------------------------------------------------------------------------
-- Stock counts
-- -----------------------------------------------------------------------------
create table public.stock_counts (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id),
  number        integer not null check (number > 0),
  status        text not null default 'open' check (status in ('open', 'posted', 'cancelled')),
  -- What was counted: everything, one section, or one category.
  section_id    uuid,
  category_id   uuid,
  note          text check (note is null or char_length(note) between 1 and 500),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  posted_by     uuid references auth.users (id) on delete set null,
  posted_at     timestamptz,
  cancelled_by  uuid references auth.users (id) on delete set null,
  cancelled_at  timestamptz,
  updated_at    timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, section_id) references public.sections (business_id, id),
  foreign key (business_id, category_id) references public.categories (business_id, id),
  check ((status = 'posted') = (posted_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
-- One count at a time, so an item is never adjusted by two counts.
create unique index stock_counts_one_open on public.stock_counts (business_id) where status = 'open';

create table public.stock_count_lines (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null,
  count_id          uuid not null,
  variant_id        uuid not null,
  -- System quantity at the moment this line was counted, and what was found.
  -- Difference = counted − system; sales after counting are not lost.
  system_quantity   numeric(18, 4),
  counted_quantity  numeric(18, 4) check (counted_quantity is null or counted_quantity >= 0),
  counted_by        uuid references auth.users (id) on delete set null,
  counted_at        timestamptz,
  unique (business_id, id),
  unique (count_id, variant_id),
  foreign key (business_id, count_id) references public.stock_counts (business_id, id),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id),
  check ((counted_quantity is null) = (system_quantity is null)),
  check ((counted_quantity is null) = (counted_at is null))
);
create index stock_count_lines_business_idx on public.stock_count_lines (business_id, count_id);

create trigger stock_counts_set_updated_at before update on public.stock_counts
  for each row execute function app.set_updated_at();
create trigger audit_stock_counts after insert or update or delete on public.stock_counts
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- The stock ledger
-- -----------------------------------------------------------------------------
create table public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated always as identity,  -- recording order
  business_id       uuid not null,
  variant_id        uuid not null,
  movement_type     public.stock_movement_type not null,
  quantity          numeric(18, 4) not null check (quantity <> 0),  -- signed, base unit
  balance_before    numeric(18, 4) not null,
  balance_after     numeric(18, 4) not null,
  -- What the person entered, e.g. 2 cartons (factor 12) = 24 pieces.
  entered_unit_id   uuid not null,
  entered_quantity  numeric(18, 4) not null check (entered_quantity > 0),
  factor            numeric(18, 6) not null check (factor > 0),
  reason            text check (reason is null or char_length(reason) between 1 and 500),
  stock_count_id    uuid,
  -- Related transaction from later stages (sale, purchase…); no FK by design.
  source_type       text,
  source_id         uuid,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id),
  foreign key (business_id, entered_unit_id) references public.units (business_id, id),
  foreign key (business_id, stock_count_id) references public.stock_counts (business_id, id),
  check (balance_after = balance_before + quantity),
  check (case
           when movement_type in ('opening', 'stock_in') then quantity > 0
           when movement_type = 'count' then true
           else quantity < 0
         end),
  check ((movement_type = 'count') = (stock_count_id is not null))
);
create index stock_movements_variant_idx on public.stock_movements (business_id, variant_id, seq);
create index stock_movements_time_idx on public.stock_movements (business_id, created_at);
create index stock_movements_count_idx on public.stock_movements (business_id, stock_count_id)
  where stock_count_id is not null;
comment on table public.stock_movements is
  'Append-only stock ledger. Every stock change, with balance before and after. Never updated or deleted.';

create function app.refuse_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records can never be changed or deleted', tg_table_name using errcode = '42501';
end;
$$;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function app.refuse_change();
create trigger stock_movements_no_truncate
  before truncate on public.stock_movements
  for each statement execute function app.refuse_change();

-- -----------------------------------------------------------------------------
-- The only code path that changes stock.
--   p_confirmed: the person has seen the "goes below zero" warning and agreed.
-- Errors: RB001 = negative stock not allowed; RB002 = needs confirmation.
-- -----------------------------------------------------------------------------
create function app.apply_stock_movement(
  p_business uuid,
  p_variant uuid,
  p_type public.stock_movement_type,
  p_quantity numeric,
  p_unit uuid,
  p_entered numeric,
  p_factor numeric,
  p_reason text,
  p_count uuid,
  p_confirmed boolean
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level public.stock_levels;
  v_after numeric;
  v_row public.stock_movements;
begin
  -- Locks this item's balance until the transaction ends.
  select * into v_level from public.stock_levels
  where variant_id = p_variant and business_id = p_business
  for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;

  v_after := v_level.on_hand + p_quantity;
  if p_quantity < 0 and v_after < 0 then
    if not coalesce((select s.allow_negative_stock from public.business_settings s
                     where s.business_id = p_business), false) then
      raise exception 'Not enough stock: only % available', trim_scale(v_level.on_hand)
        using errcode = 'RB001';
    elsif not p_confirmed then
      raise exception 'This will take stock below zero (% available)', trim_scale(v_level.on_hand)
        using errcode = 'RB002';
    end if;
  end if;

  insert into public.stock_movements (
    business_id, variant_id, movement_type, quantity, balance_before, balance_after,
    entered_unit_id, entered_quantity, factor, reason, stock_count_id, created_by
  ) values (
    p_business, p_variant, p_type, p_quantity, v_level.on_hand, v_after,
    p_unit, p_entered, p_factor, nullif(trim(p_reason), ''), p_count, (select auth.uid())
  )
  returning * into v_row;

  update public.stock_levels
  set on_hand = v_after,
      movement_count = movement_count + 1,
      last_movement_at = v_row.created_at,
      updated_at = now()
  where variant_id = p_variant;

  return v_row;
end;
$$;
revoke all on function app.apply_stock_movement(uuid, uuid, public.stock_movement_type, numeric,
  uuid, numeric, numeric, text, uuid, boolean) from public;

-- Checks a quantity typed by a person against the item's base unit.
create function app.check_base_quantity(p_quantity numeric, p_allows_decimal boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_quantity <> round(p_quantity, 4) then
    raise exception 'Use at most 4 decimal places' using errcode = '22023';
  end if;
  if not p_allows_decimal and p_quantity <> trunc(p_quantity) then
    raise exception 'This item is counted in whole numbers' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Manual stock changes: opening stock, add, deduct, write-offs.
-- -----------------------------------------------------------------------------
create function public.record_stock_movement(
  p_variant uuid,
  p_type public.stock_movement_type,
  p_unit uuid,
  p_quantity numeric,
  p_reason text default null,
  p_confirm_negative boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants;
  v_product public.products;
  v_factor numeric;
  v_base_decimal boolean;
  v_base numeric;
  v_level public.stock_levels;
  v_row public.stock_movements;
  v_permission text;
begin
  select * into v_variant from public.product_variants where id = p_variant;
  if not found then
    raise exception 'You do not have permission to change stock' using errcode = '42501';
  end if;

  v_permission := case
    when p_type in ('opening', 'stock_in', 'stock_out') then 'inventory.stock.adjust'
    when p_type in ('damaged', 'expired', 'missing', 'written_off') then 'inventory.writeoff.record'
  end;
  if v_permission is null then
    raise exception 'Stock counts are recorded through a stock count' using errcode = '22023';
  end if;
  if not app.has_permission(v_variant.business_id, v_permission) then
    raise exception 'You do not have permission to change stock' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = v_variant.product_id;
  if v_variant.status <> 'active' or v_product.status <> 'active' then
    raise exception 'This item is archived. Restore it before changing its stock' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero' using errcode = '22023';
  end if;
  if p_quantity <> round(p_quantity, 4) then
    raise exception 'Use at most 4 decimal places' using errcode = '22023';
  end if;
  if p_type not in ('opening', 'stock_in') and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) > 500 then
    raise exception 'Keep the reason to 500 characters or fewer' using errcode = '22023';
  end if;

  select pu.factor into v_factor from public.product_units pu
  where pu.business_id = v_variant.business_id and pu.product_id = v_variant.product_id
    and pu.unit_id = p_unit and pu.status = 'active';
  if not found then
    raise exception 'This product is not counted in that unit' using errcode = '22023';
  end if;
  select u.allows_decimal into v_base_decimal from public.units u where u.id = v_product.base_unit_id;
  v_base := p_quantity * v_factor;
  perform app.check_base_quantity(v_base, v_base_decimal);

  if p_type = 'opening' then
    select * into v_level from public.stock_levels where variant_id = p_variant for update;
    if v_level.movement_count > 0 then
      raise exception 'This item already has stock records. Use "Add stock" instead' using errcode = '22023';
    end if;
  end if;

  v_row := app.apply_stock_movement(
    v_variant.business_id, p_variant, p_type,
    case when p_type in ('opening', 'stock_in') then v_base else -v_base end,
    p_unit, p_quantity, v_factor, p_reason, null, coalesce(p_confirm_negative, false));

  return jsonb_build_object('movement_id', v_row.id, 'balance_after', trim_scale(v_row.balance_after)::text);
end;
$$;

-- -----------------------------------------------------------------------------
-- Stock counts
-- -----------------------------------------------------------------------------
create function public.start_stock_count(
  p_business uuid,
  p_section uuid default null,
  p_category uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number integer;
  v_section uuid := p_section;
  v_lines integer;
begin
  if not app.has_permission(p_business, 'inventory.count.post') then
    raise exception 'You do not have permission to start a stock count' using errcode = '42501';
  end if;
  if p_category is not null then
    select c.section_id into v_section from public.categories c
    where c.id = p_category and c.business_id = p_business;
    if not found or (p_section is not null and v_section <> p_section) then
      raise exception 'Category not found' using errcode = '22023';
    end if;
  elsif p_section is not null and not exists (
    select 1 from public.sections s where s.id = p_section and s.business_id = p_business
  ) then
    raise exception 'Section not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.stock_counts where business_id = p_business and status = 'open') then
    raise exception 'A stock count is already in progress. Finish or cancel it first' using errcode = '23505';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stock_count:' || p_business::text, 0));
  select coalesce(max(number), 0) + 1 into v_number from public.stock_counts where business_id = p_business;

  insert into public.stock_counts (business_id, number, section_id, category_id, note, created_by)
  values (p_business, v_number, v_section, p_category, nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;

  insert into public.stock_count_lines (business_id, count_id, variant_id)
  select p_business, v_id, v.id
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.business_id = p_business and v.status = 'active' and p.status = 'active'
    and (v_section is null or p.section_id = v_section)
    and (p_category is null or p.category_id = p_category);
  get diagnostics v_lines = row_count;
  if v_lines = 0 then
    raise exception 'There are no active items to count here' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

-- Records (or clears, with null) what was found on the shelf for one line.
create function public.record_count_line(p_line uuid, p_counted numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.stock_count_lines;
  v_status text;
  v_decimal boolean;
begin
  select * into v_line from public.stock_count_lines where id = p_line for update;
  if not found
     or not (app.has_permission(v_line.business_id, 'inventory.count.perform')
             or app.has_permission(v_line.business_id, 'inventory.count.post')) then
    raise exception 'You do not have permission to count stock' using errcode = '42501';
  end if;
  select status into v_status from public.stock_counts where id = v_line.count_id;
  if v_status <> 'open' then
    raise exception 'This stock count is finished' using errcode = '22023';
  end if;

  if p_counted is null then
    update public.stock_count_lines
    set counted_quantity = null, system_quantity = null, counted_by = null, counted_at = null
    where id = p_line;
    return;
  end if;
  if p_counted < 0 then
    raise exception 'A count cannot be below zero' using errcode = '22023';
  end if;
  select u.allows_decimal into v_decimal
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.units u on u.id = p.base_unit_id
  where v.id = v_line.variant_id;
  perform app.check_base_quantity(p_counted, v_decimal);

  update public.stock_count_lines
  set counted_quantity = p_counted,
      system_quantity = (select on_hand from public.stock_levels where variant_id = v_line.variant_id),
      counted_by = (select auth.uid()),
      counted_at = now()
  where id = p_line;
end;
$$;

-- Posts the differences of all counted lines as 'count' movements and closes the count.
create function public.post_stock_count(p_count uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_line record;
  v_adjusted integer := 0;
  v_counted integer := 0;
begin
  select * into v_count from public.stock_counts where id = p_count for update;
  if not found or not app.has_permission(v_count.business_id, 'inventory.count.post') then
    raise exception 'You do not have permission to post stock counts' using errcode = '42501';
  end if;
  if v_count.status <> 'open' then
    raise exception 'This stock count is already finished' using errcode = '22023';
  end if;

  for v_line in
    select l.variant_id, l.counted_quantity - l.system_quantity as difference, p.base_unit_id
    from public.stock_count_lines l
    join public.product_variants v on v.id = l.variant_id
    join public.products p on p.id = v.product_id
    where l.count_id = p_count and l.counted_quantity is not null
    order by l.variant_id  -- fixed order: no deadlocks with other postings
  loop
    v_counted := v_counted + 1;
    if v_line.difference <> 0 then
      perform app.apply_stock_movement(
        v_count.business_id, v_line.variant_id, 'count', v_line.difference,
        v_line.base_unit_id, abs(v_line.difference), 1,
        'Stock count ' || v_count.number, p_count, true);
      v_adjusted := v_adjusted + 1;
    end if;
  end loop;
  if v_counted = 0 then
    raise exception 'Count at least one item before posting' using errcode = '22023';
  end if;

  update public.stock_counts
  set status = 'posted', posted_by = (select auth.uid()), posted_at = now()
  where id = p_count;
  return jsonb_build_object('counted', v_counted, 'adjusted', v_adjusted);
end;
$$;

create function public.cancel_stock_count(p_count uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
begin
  select * into v_count from public.stock_counts where id = p_count for update;
  if not found or not app.has_permission(v_count.business_id, 'inventory.count.post') then
    raise exception 'You do not have permission to cancel stock counts' using errcode = '42501';
  end if;
  if v_count.status <> 'open' then
    raise exception 'This stock count is already finished' using errcode = '22023';
  end if;
  update public.stock_counts
  set status = 'cancelled', cancelled_by = (select auth.uid()), cancelled_at = now()
  where id = p_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reading stock (run as the caller: Row-Level Security applies)
-- -----------------------------------------------------------------------------
create function app.stock_status(p_on_hand numeric, p_min numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_on_hand < 0 then 'negative'
    when p_on_hand = 0 then 'out'
    when p_min > 0 and p_on_hand <= p_min then 'low'
    else 'ok'
  end
$$;
grant execute on function app.stock_status(numeric, numeric) to authenticated;

-- One row per variant with its stock, filtered and paged; total_count = all matches.
--   p_status: all | low | out (includes negative) | negative | ok
create function public.stock_overview(
  p_business uuid,
  p_q text default '',
  p_section uuid default null,
  p_category uuid default null,
  p_status text default 'all',
  p_archived boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  brand text,
  option_names text[],
  option_values text[],
  sku text,
  barcode text,
  section_name text,
  category_name text,
  base_unit_code text,
  base_allows_decimal boolean,
  on_hand numeric,
  min_stock_level numeric,
  stock_status text,
  is_active boolean,
  last_movement_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rows as (
    select v.id as variant_id, p.id as product_id, p.name as product_name, p.brand,
           p.option_names, v.option_values, v.sku, v.barcode,
           s.name as section_name, c.name as category_name,
           u.code as base_unit_code, u.allows_decimal as base_allows_decimal,
           l.on_hand, v.min_stock_level,
           app.stock_status(l.on_hand, v.min_stock_level) as stock_status,
           (v.status = 'active' and p.status = 'active') as is_active,
           l.last_movement_at
    from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.stock_levels l on l.variant_id = v.id
    join public.sections s on s.id = p.section_id
    left join public.categories c on c.id = p.category_id
    join public.units u on u.id = p.base_unit_id
    where v.business_id = p_business
      and ((v.status = 'active' and p.status = 'active') <> coalesce(p_archived, false))
      and (p_section is null or p.section_id = p_section)
      and (p_category is null or p.category_id = p_category)
      and (coalesce(p_q, '') = ''
           or strpos(lower(p.name), lower(p_q)) > 0
           or strpos(lower(coalesce(p.brand, '')), lower(p_q)) > 0
           or strpos(lower(v.sku), lower(p_q)) > 0
           or strpos(lower(coalesce(v.barcode, '')), lower(p_q)) > 0)
  )
  select r.*, count(*) over () as total_count
  from rows r
  where case coalesce(p_status, 'all')
          when 'all' then true
          when 'out' then r.stock_status in ('out', 'negative')
          else r.stock_status = p_status
        end
  order by lower(r.product_name), r.product_id, r.option_values
  limit least(greatest(coalesce(p_limit, 25), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Numbers for the top of the inventory page.
create function public.stock_summary(p_business uuid)
returns table (items bigint, low bigint, out_of_stock bigint, negative bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*),
         count(*) filter (where st = 'low'),
         count(*) filter (where st in ('out', 'negative')),
         count(*) filter (where st = 'negative')
  from (
    select app.stock_status(l.on_hand, v.min_stock_level) as st
    from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.stock_levels l on l.variant_id = v.id
    where v.business_id = p_business and v.status = 'active' and p.status = 'active'
  ) x
$$;

-- Movement history, newest first, with item and person names.
create function public.stock_movement_history(
  p_business uuid,
  p_variant uuid default null,
  p_types public.stock_movement_type[] default null,
  p_count uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  seq bigint,
  created_at timestamptz,
  variant_id uuid,
  product_id uuid,
  product_name text,
  option_values text[],
  sku text,
  movement_type public.stock_movement_type,
  quantity numeric,
  balance_before numeric,
  balance_after numeric,
  entered_quantity numeric,
  entered_unit_code text,
  base_unit_code text,
  reason text,
  stock_count_id uuid,
  created_by_name text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.seq, m.created_at, m.variant_id, p.id, p.name, v.option_values, v.sku,
         m.movement_type, m.quantity, m.balance_before, m.balance_after,
         m.entered_quantity, eu.code, bu.code, m.reason, m.stock_count_id,
         coalesce(nullif(pr.full_name, ''), 'Unknown'),
         count(*) over ()
  from public.stock_movements m
  join public.product_variants v on v.id = m.variant_id
  join public.products p on p.id = v.product_id
  join public.units eu on eu.id = m.entered_unit_id
  join public.units bu on bu.id = p.base_unit_id
  left join public.profiles pr on pr.id = m.created_by
  where m.business_id = p_business
    and (p_variant is null or m.variant_id = p_variant)
    and (p_types is null or m.movement_type = any (p_types))
    and (p_count is null or m.stock_count_id = p_count)
  order by m.seq desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Reconciliation: proves every balance equals the sum of its movements and
-- the last recorded balance. Returns how many items were checked and any
-- that disagree (there should never be any).
create function public.check_stock_records(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_checked integer;
  v_problems jsonb;
begin
  if not app.has_permission(p_business, 'inventory.stock.view') then
    raise exception 'You do not have permission to view stock' using errcode = '42501';
  end if;
  select count(*) into v_checked from public.stock_levels where business_id = p_business;
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', x.variant_id, 'on_hand', x.on_hand,
           'ledger_total', x.ledger_total, 'last_balance', x.last_balance,
           'movement_count', x.movement_count, 'ledger_count', x.ledger_count)), '[]'::jsonb)
  into v_problems
  from (
    select l.variant_id, l.on_hand, l.movement_count,
           coalesce(sum(m.quantity), 0) as ledger_total,
           count(m.id) as ledger_count,
           (select m2.balance_after from public.stock_movements m2
            where m2.variant_id = l.variant_id order by m2.seq desc limit 1) as last_balance
    from public.stock_levels l
    left join public.stock_movements m on m.variant_id = l.variant_id
    where l.business_id = p_business
    group by l.variant_id, l.on_hand, l.movement_count
  ) x
  where x.on_hand <> x.ledger_total
     or x.movement_count <> x.ledger_count
     or x.on_hand <> coalesce(x.last_balance, 0);
  return jsonb_build_object('checked', v_checked, 'problems', v_problems);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges and Row-Level Security: read-only tables; changes only through
-- the functions above.
-- -----------------------------------------------------------------------------
revoke all on public.stock_levels, public.stock_movements, public.stock_counts,
  public.stock_count_lines from anon, authenticated;
grant select on public.stock_levels, public.stock_movements, public.stock_counts,
  public.stock_count_lines to authenticated;

revoke all on function
  public.record_stock_movement(uuid, public.stock_movement_type, uuid, numeric, text, boolean),
  public.start_stock_count(uuid, uuid, uuid, text),
  public.record_count_line(uuid, numeric),
  public.post_stock_count(uuid),
  public.cancel_stock_count(uuid),
  public.stock_overview(uuid, text, uuid, uuid, text, boolean, integer, integer),
  public.stock_summary(uuid),
  public.stock_movement_history(uuid, uuid, public.stock_movement_type[], uuid, integer, integer),
  public.check_stock_records(uuid),
  app.check_base_quantity(numeric, boolean),
  app.create_stock_level()
from public, anon;
grant execute on function
  public.record_stock_movement(uuid, public.stock_movement_type, uuid, numeric, text, boolean),
  public.start_stock_count(uuid, uuid, uuid, text),
  public.record_count_line(uuid, numeric),
  public.post_stock_count(uuid),
  public.cancel_stock_count(uuid),
  public.stock_overview(uuid, text, uuid, uuid, text, boolean, integer, integer),
  public.stock_summary(uuid),
  public.stock_movement_history(uuid, uuid, public.stock_movement_type[], uuid, integer, integer),
  public.check_stock_records(uuid)
to authenticated;

alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;

create function app.can_view_counts(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission(p_business, 'inventory.stock.view')
      or app.has_permission(p_business, 'inventory.count.perform')
      or app.has_permission(p_business, 'inventory.count.post');
$$;
revoke all on function app.can_view_counts(uuid) from public;
grant execute on function app.can_view_counts(uuid) to authenticated;

create policy stock_levels_read on public.stock_levels for select to authenticated
  using (app.has_permission(business_id, 'inventory.stock.view'));
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (app.has_permission(business_id, 'inventory.stock.view'));
create policy stock_counts_read on public.stock_counts for select to authenticated
  using (app.can_view_counts(business_id));
create policy stock_count_lines_read on public.stock_count_lines for select to authenticated
  using (app.can_view_counts(business_id));
