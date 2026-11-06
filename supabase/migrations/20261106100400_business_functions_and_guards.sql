-- =============================================================================
-- Stage 3 · Migration 5 of 5 — Business functions and guard rules
--
-- Callable functions (exposed to signed-in users through the API):
--   public.create_business(...)          creates a business; caller becomes Owner
--   public.set_module_enabled(...)        switches an optional module on/off
--   public.current_user_permissions(...)  permissions the caller holds (for the UI)
--
-- Guard triggers (block privilege escalation even when RLS allows the write):
--   * the owner role cannot be created, changed, deleted or given explicit permissions
--   * only an owner can give someone the owner role or change an owner's membership
--   * nobody can give a member a role with permissions they don't hold themselves
--   * nobody can change their own role or status
--   * a business must always keep at least one active owner
--
-- "Client writes" means writes made directly by a signed-in user through the
-- API (database role `authenticated`). Trusted SECURITY DEFINER functions run as
-- the table owner and perform their own checks, so guards skip them — except
-- the last-owner rule, which applies to everyone.
-- =============================================================================

create function app.is_client_write()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon');
$$;

-- True when the caller holds every permission granted to the role (owners hold all).
create function app.holds_all_permissions_of_role(p_business uuid, p_role uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_owner(p_business)
    or (
      not exists (
        select 1 from public.roles r
        where r.business_id = p_business and r.id = p_role and r.is_owner
      )
      and not exists (
        select 1 from public.role_permissions rp
        where rp.business_id = p_business
          and rp.role_id = p_role
          and not app.has_permission(p_business, rp.permission_code)
      )
    );
$$;

revoke all on function app.is_client_write(), app.holds_all_permissions_of_role(uuid, uuid) from public;
grant execute on function app.is_client_write(), app.holds_all_permissions_of_role(uuid, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Roles guard
-- -----------------------------------------------------------------------------
create function app.guard_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.business_id <> old.business_id or new.is_owner <> old.is_owner then
      raise exception 'A role cannot be moved to another business or change its owner flag'
        using errcode = '42501';
    end if;
  end if;

  if not app.is_client_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' and new.is_owner then
    raise exception 'The owner role is created automatically and cannot be added'
      using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.is_owner then
    raise exception 'The owner role cannot be changed or deleted' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger roles_guard
  before insert or update or delete on public.roles
  for each row execute function app.guard_roles();

-- -----------------------------------------------------------------------------
-- Role permissions guard
-- -----------------------------------------------------------------------------
create function app.guard_role_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row public.role_permissions := coalesce(new, old);
begin
  if exists (
    select 1 from public.roles
    where business_id = v_row.business_id and id = v_row.role_id and is_owner
  ) then
    raise exception 'The owner role has every permission automatically' using errcode = '42501';
  end if;

  if app.is_client_write() and tg_op = 'DELETE'
     and not app.has_permission(v_row.business_id, v_row.permission_code) then
    raise exception 'You cannot remove a permission you do not hold' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger role_permissions_guard
  before insert or update or delete on public.role_permissions
  for each row execute function app.guard_role_permissions();

-- -----------------------------------------------------------------------------
-- Business members guard
-- -----------------------------------------------------------------------------
create function app.guard_business_members()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_is_owner_role boolean := false;
  v_new_is_owner_role boolean;
begin
  if tg_op = 'UPDATE' and (new.business_id <> old.business_id
      or new.user_id is distinct from old.user_id and old.user_id is not null) then
    raise exception 'A membership cannot be moved to another business or person'
      using errcode = '42501';
  end if;

  if not app.is_client_write() then
    return new;
  end if;

  select is_owner into v_new_is_owner_role
  from public.roles where business_id = new.business_id and id = new.role_id;

  if tg_op = 'UPDATE' then
    select is_owner into v_old_is_owner_role
    from public.roles where business_id = old.business_id and id = old.role_id;

    if old.user_id = (select auth.uid())
       and (new.role_id <> old.role_id or new.status <> old.status) then
      raise exception 'You cannot change your own role or status' using errcode = '42501';
    end if;
  end if;

  if (v_new_is_owner_role or v_old_is_owner_role) and not app.is_owner(new.business_id) then
    raise exception 'Only an owner can give or change the owner role' using errcode = '42501';
  end if;

  if (tg_op = 'INSERT' or new.role_id <> old.role_id)
     and not app.holds_all_permissions_of_role(new.business_id, new.role_id) then
    raise exception 'You cannot assign a role with permissions you do not hold'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger business_members_guard
  before insert or update on public.business_members
  for each row execute function app.guard_business_members();

-- A business must always keep at least one active owner (checked at commit,
-- so ownership can be handed over inside one transaction).
create function app.ensure_business_has_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_business uuid := coalesce(new.business_id, old.business_id);
begin
  if not exists (
    select 1
    from public.business_members m
    join public.roles r on r.business_id = m.business_id and r.id = m.role_id
    where m.business_id = v_business and m.status = 'active' and r.is_owner
  ) then
    raise exception 'A business must keep at least one active owner' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger business_members_keep_owner
  after update or delete on public.business_members
  deferrable initially deferred
  for each row execute function app.ensure_business_has_owner();

-- Record who last changed settings.
create function app.stamp_settings_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger business_settings_stamp_updated_by
  before update on public.business_settings
  for each row execute function app.stamp_settings_updated_by();

-- -----------------------------------------------------------------------------
-- public.create_business
-- -----------------------------------------------------------------------------
create function public.create_business(
  p_name     text,
  p_slug     text,
  p_timezone text default 'Africa/Lagos',
  p_currency text default 'NGN',
  p_country  text default 'NG'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_business uuid;
  v_owner    uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in to create a business' using errcode = '42501';
  end if;

  begin
    insert into public.businesses (name, slug, timezone, currency_code, country_code, created_by)
    values (p_name, lower(btrim(p_slug)), p_timezone, upper(p_currency), upper(p_country), v_user)
    returning id into v_business;
  exception when unique_violation then
    raise exception 'The business address "%" is already taken', lower(btrim(p_slug))
      using errcode = '23505';
  end;

  insert into public.business_settings (business_id) values (v_business);

  -- Every optional module starts switched off.
  insert into public.business_modules (business_id, module_code, is_enabled)
  select v_business, code, false from public.modules where not is_core;

  -- Copy role templates into the business so the owner can edit them.
  insert into public.roles (business_id, key, name, description, is_owner, template_key)
  select v_business, key, name, description, is_owner, key
  from public.role_templates;

  insert into public.role_permissions (business_id, role_id, permission_code)
  select v_business, r.id, tp.permission_code
  from public.role_template_permissions tp
  join public.roles r on r.business_id = v_business and r.template_key = tp.template_key
  where not r.is_owner;

  select id into v_owner from public.roles where business_id = v_business and is_owner;

  insert into public.business_members (business_id, user_id, role_id, status, joined_at)
  values (v_business, v_user, v_owner, 'active', now());

  return v_business;
end;
$$;

revoke all on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- public.set_module_enabled
-- -----------------------------------------------------------------------------
create function public.set_module_enabled(p_business uuid, p_module text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module  public.modules;
  v_blocker text;
begin
  if not app.has_permission(p_business, 'core.module.manage') then
    raise exception 'You do not have permission to change modules' using errcode = '42501';
  end if;

  select * into v_module from public.modules where code = p_module;
  if not found then
    raise exception 'Unknown module: %', p_module using errcode = '22023';
  end if;
  if v_module.is_core then
    raise exception '% is a core module and is always on', v_module.name using errcode = '22023';
  end if;

  -- Lock this business's module rows so two changes cannot race each other.
  perform 1 from public.business_modules where business_id = p_business for update;

  if p_enabled then
    select string_agg(m.name, ', ') into v_blocker
    from unnest(v_module.requires) as req(code)
    join public.modules m on m.code = req.code
    where not app.module_enabled(p_business, req.code);

    if v_blocker is not null then
      raise exception '% needs % to be enabled first', v_module.name, v_blocker
        using errcode = '22023';
    end if;
  else
    select string_agg(m.name, ', ') into v_blocker
    from public.modules m
    where p_module = any (m.requires)
      and not m.is_core
      and app.module_enabled(p_business, m.code);

    if v_blocker is not null then
      raise exception 'Disable % first; it needs %', v_blocker, v_module.name
        using errcode = '22023';
    end if;
  end if;

  -- Disabling never deletes data: it only flips this flag.
  update public.business_modules
  set is_enabled  = p_enabled,
      enabled_at  = case when p_enabled then now() else enabled_at end,
      disabled_at = case when p_enabled then disabled_at else now() end,
      updated_by  = (select auth.uid())
  where business_id = p_business and module_code = p_module
    and is_enabled is distinct from p_enabled;
end;
$$;

revoke all on function public.set_module_enabled(uuid, text, boolean) from public, anon;
grant execute on function public.set_module_enabled(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- public.current_user_permissions — for showing/hiding UI and server checks.
-- (The database still enforces every rule on its own.)
-- -----------------------------------------------------------------------------
create function public.current_user_permissions(p_business uuid)
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select p.code
  from public.permissions p
  where app.has_permission(p_business, p.code)
  order by p.code;
$$;

revoke all on function public.current_user_permissions(uuid) from public, anon;
grant execute on function public.current_user_permissions(uuid) to authenticated;
