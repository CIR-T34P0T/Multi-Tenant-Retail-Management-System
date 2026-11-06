-- =============================================================================
-- Stage 3 · Migration 4 of 5 — Security helpers and Row-Level Security (RLS)
--
-- Plain-language summary:
--   RLS makes PostgreSQL itself filter every query. Even if the app had a bug
--   and asked for "all businesses", the database would return only the ones
--   the signed-in user belongs to. Writes are allowed only when the user's
--   role grants the matching permission AND the module is switched on.
--
-- Helper functions (schema `app`, SECURITY DEFINER so they can read the
-- membership tables regardless of the caller's own RLS):
--   app.is_member(business)                  active member of an active business?
--   app.is_owner(business)                   holds the owner role?
--   app.module_enabled(business, module)     core module, or optional module switched on?
--   app.has_permission(business, permission) role grants it (owner: all) and module on?
--   app.shares_business_with(user)           for showing teammates' names
-- =============================================================================

create function app.is_member(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and b.status = 'active'
  );
$$;

create function app.is_owner(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.roles r on r.business_id = m.business_id and r.id = m.role_id
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and b.status = 'active'
      and r.is_owner
  );
$$;

create function app.module_enabled(p_business uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when m.is_core then true
        else coalesce(
          (select bm.is_enabled
           from public.business_modules bm
           where bm.business_id = p_business and bm.module_code = m.code),
          false)
      end
      from public.modules m
      where m.code = p_module
    ),
    false);
$$;

create function app.has_permission(p_business uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    join public.roles r on r.business_id = m.business_id and r.id = m.role_id
    join public.permissions p on p.code = p_permission
    where m.business_id = p_business
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and b.status = 'active'
      and app.module_enabled(p_business, p.module_code)
      and (
        r.is_owner
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission_code = p_permission
        )
      )
  );
$$;

create function app.shares_business_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members mine
    join public.business_members theirs on theirs.business_id = mine.business_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_user
  );
$$;

revoke all on function
  app.is_member(uuid),
  app.is_owner(uuid),
  app.module_enabled(uuid, text),
  app.has_permission(uuid, text),
  app.shares_business_with(uuid)
from public;

grant execute on function
  app.is_member(uuid),
  app.is_owner(uuid),
  app.module_enabled(uuid, text),
  app.has_permission(uuid, text),
  app.shares_business_with(uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Baseline privileges
--
-- Supabase grants broad table privileges to `anon` and `authenticated` by
-- default and relies on RLS. We go further: signed-out visitors (`anon`) get
-- nothing at all on business data, and tables written only by functions get
-- no direct write privileges.
-- -----------------------------------------------------------------------------
-- Start from nothing, then grant back exactly what each table needs.
revoke all on
  public.modules, public.permissions, public.role_templates, public.role_template_permissions,
  public.profiles, public.businesses, public.roles, public.role_permissions,
  public.business_members, public.business_settings, public.business_modules, public.audit_logs
from anon, authenticated;

-- Reference data: read-only.
grant select on
  public.modules, public.permissions, public.role_templates, public.role_template_permissions
to authenticated;

-- Created only through functions/triggers; editable by permitted users.
grant select, update on public.businesses, public.business_settings, public.profiles to authenticated;

-- Changed only through set_module_enabled(); audit log is written only by triggers.
grant select on public.business_modules, public.audit_logs to authenticated;

-- Members are suspended, never deleted (keeps history intact).
grant select, insert, update on public.business_members to authenticated;

-- Roles can be removed; a role permission is changed by deleting and re-adding it.
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.modules                   enable row level security;
alter table public.permissions               enable row level security;
alter table public.role_templates            enable row level security;
alter table public.role_template_permissions enable row level security;
alter table public.profiles                  enable row level security;
alter table public.businesses                enable row level security;
alter table public.roles                     enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.business_members          enable row level security;
alter table public.business_settings         enable row level security;
alter table public.business_modules          enable row level security;
-- audit_logs: enabled in migration 1.

-- Reference data: any signed-in user may read.
create policy modules_read on public.modules for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_templates_read on public.role_templates for select to authenticated using (true);
create policy role_template_permissions_read on public.role_template_permissions
  for select to authenticated using (true);

-- Profiles: your own, plus teammates' (names on screens). Edit only your own.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_business_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Businesses: members read; permitted users update. Creation via create_business().
create policy businesses_read on public.businesses for select to authenticated
  using (app.is_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (app.has_permission(id, 'core.business.update'))
  with check (app.has_permission(id, 'core.business.update'));

-- Settings
create policy business_settings_read on public.business_settings for select to authenticated
  using (app.is_member(business_id));
create policy business_settings_update on public.business_settings for update to authenticated
  using (app.has_permission(business_id, 'core.settings.manage'))
  with check (app.has_permission(business_id, 'core.settings.manage'));

-- Modules switched on/off: members read; changes only via set_module_enabled().
create policy business_modules_read on public.business_modules for select to authenticated
  using (app.is_member(business_id));

-- Roles: members read; role managers write (guard triggers protect the owner role).
create policy roles_read on public.roles for select to authenticated
  using (app.is_member(business_id));
create policy roles_insert on public.roles for insert to authenticated
  with check (app.has_permission(business_id, 'core.role.manage'));
create policy roles_update on public.roles for update to authenticated
  using (app.has_permission(business_id, 'core.role.manage'))
  with check (app.has_permission(business_id, 'core.role.manage'));
create policy roles_delete on public.roles for delete to authenticated
  using (app.has_permission(business_id, 'core.role.manage'));

-- Role permissions: you can only grant permissions you hold yourself.
create policy role_permissions_read on public.role_permissions for select to authenticated
  using (app.is_member(business_id));
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (
    app.has_permission(business_id, 'core.role.manage')
    and app.has_permission(business_id, permission_code)
  );
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (app.has_permission(business_id, 'core.role.manage'));

-- Members: you see your own row; staff managers see everyone in the business.
create policy business_members_read on public.business_members for select to authenticated
  using (
    (user_id = (select auth.uid()) and app.is_member(business_id))
    or app.has_permission(business_id, 'core.member.view')
    or app.has_permission(business_id, 'core.member.manage')
  );
create policy business_members_insert on public.business_members for insert to authenticated
  with check (app.has_permission(business_id, 'core.member.manage'));
create policy business_members_update on public.business_members for update to authenticated
  using (app.has_permission(business_id, 'core.member.manage'))
  with check (app.has_permission(business_id, 'core.member.manage'));

-- Audit log: read-only for permitted users of that business.
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (business_id is not null and app.has_permission(business_id, 'core.audit.view'));
