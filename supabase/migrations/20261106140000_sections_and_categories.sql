-- =============================================================================
-- Stage 5 — Sections and categories
--
-- Business → Sections → Categories (→ Products in Stage 6).
--   * A section is a department of ONE business (Groceries, Frozen Food…).
--   * A category groups products inside ONE section (Rice, Noodles…).
--   * Nothing is ever deleted: sections and categories are archived/restored.
--   * Archiving a section makes it and its categories unavailable for new
--     products; each category keeps its own status, so restoring the section
--     brings everything back as it was.
--   * Names are unique (ignoring capitals and extra spaces): section names
--     within a business, category names within a section.
--
-- Permissions: catalog.product.view to see, catalog.section.manage to change.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.sections (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id),
  name         text not null check (char_length(name) between 1 and 60),
  description  text not null default '' check (char_length(description) <= 300),
  sort_order   int not null default 0,
  status       public.record_status not null default 'active'
                 check (status in ('active', 'archived')),
  archived_at  timestamptz,
  archived_by  uuid references auth.users (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, id),
  check ((status = 'archived') = (archived_at is not null))
);

create unique index sections_business_name_key on public.sections (business_id, lower(name));
create index sections_business_status_idx on public.sections (business_id, status, sort_order);

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id),
  section_id   uuid not null,
  name         text not null check (char_length(name) between 1 and 60),
  description  text not null default '' check (char_length(description) <= 300),
  sort_order   int not null default 0,
  status       public.record_status not null default 'active'
                 check (status in ('active', 'archived')),
  archived_at  timestamptz,
  archived_by  uuid references auth.users (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, id),
  -- Target for Stage 6: products reference (business_id, section_id, category_id),
  -- which guarantees a product's category is in the product's section.
  unique (business_id, section_id, id),
  -- Composite key: a category can only belong to a section of the SAME business.
  foreign key (business_id, section_id) references public.sections (business_id, id),
  check ((status = 'archived') = (archived_at is not null))
);

create unique index categories_section_name_key on public.categories (section_id, lower(name));
create index categories_business_section_idx on public.categories (business_id, section_id, status);

comment on table public.sections is 'Departments of a business (e.g. Groceries). Archived, never deleted.';
comment on table public.categories is 'Product groupings inside a section (e.g. Rice). Archived, never deleted.';

-- -----------------------------------------------------------------------------
-- Housekeeping trigger shared by both tables:
--   tidy names, stamp creator/archiver, keep ownership fields fixed.
-- -----------------------------------------------------------------------------
create function app.catalog_row_housekeeping()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- "  Frozen   Food " → "Frozen Food"
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.description := btrim(new.description);
  if new.name = '' then
    raise exception 'Enter a name' using errcode = '23514';
  end if;

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

create trigger sections_housekeeping
  before insert or update on public.sections
  for each row execute function app.catalog_row_housekeeping();
create trigger categories_housekeeping
  before insert or update on public.categories
  for each row execute function app.catalog_row_housekeeping();

create trigger sections_set_updated_at
  before update on public.sections
  for each row execute function app.set_updated_at();
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function app.set_updated_at();

-- New categories cannot be added to (or moved into) an archived section.
create function app.categories_require_active_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.section_id <> old.section_id)
     and exists (
       select 1 from public.sections s
       where s.business_id = new.business_id and s.id = new.section_id and s.status = 'archived'
     ) then
    raise exception 'This section is archived. Restore it before adding categories to it.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function app.categories_require_active_section() from public;

create trigger categories_require_active_section
  before insert or update of section_id on public.categories
  for each row execute function app.categories_require_active_section();

-- Audit every change.
create trigger audit_sections after insert or update or delete on public.sections
  for each row execute function app.audit_row_change();
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Privileges and Row-Level Security
-- -----------------------------------------------------------------------------
revoke all on public.sections, public.categories from anon, authenticated;
-- No delete privilege: archive instead.
grant select, insert, update on public.sections, public.categories to authenticated;

alter table public.sections enable row level security;
alter table public.categories enable row level security;

create policy sections_read on public.sections for select to authenticated
  using (
    app.has_permission(business_id, 'catalog.product.view')
    or app.has_permission(business_id, 'catalog.section.manage')
  );
create policy sections_insert on public.sections for insert to authenticated
  with check (app.has_permission(business_id, 'catalog.section.manage'));
create policy sections_update on public.sections for update to authenticated
  using (app.has_permission(business_id, 'catalog.section.manage'))
  with check (app.has_permission(business_id, 'catalog.section.manage'));

create policy categories_read on public.categories for select to authenticated
  using (
    app.has_permission(business_id, 'catalog.product.view')
    or app.has_permission(business_id, 'catalog.section.manage')
  );
create policy categories_insert on public.categories for insert to authenticated
  with check (app.has_permission(business_id, 'catalog.section.manage'));
create policy categories_update on public.categories for update to authenticated
  using (app.has_permission(business_id, 'catalog.section.manage'))
  with check (app.has_permission(business_id, 'catalog.section.manage'));
