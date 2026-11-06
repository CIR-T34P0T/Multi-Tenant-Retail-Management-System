-- =============================================================================
-- Stage 4 · Fix: delegating permissions of modules that are switched off
--
-- Problem found by test 07: "can this person hand out permission X?" used
-- app.has_permission(), which is false whenever X's module is switched off.
-- So nobody could invite an attendant (whose role includes Sales permissions)
-- or add Sales permissions to a role while Sales was off.
--
-- Two different questions, now two functions:
--   app.has_permission(b, p)  — can you USE it now? (role grants it AND module on)
--   app.role_grants(b, p)     — is it YOURS to hand out? (role grants it; module ignored)
-- Delegation rules use role_grants(); every "use" check keeps has_permission().
-- =============================================================================

create function app.role_grants(p_business uuid, p_permission text)
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
      and (
        r.is_owner
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission_code = p_permission
        )
      )
  );
$$;

revoke all on function app.role_grants(uuid, text) from public;
grant execute on function app.role_grants(uuid, text) to authenticated, service_role;

create or replace function app.holds_all_permissions_of_role(p_business uuid, p_role uuid)
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
          and not app.role_grants(p_business, rp.permission_code)
      )
    );
$$;

drop policy role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (
    app.has_permission(business_id, 'core.role.manage')
    and app.role_grants(business_id, permission_code)
  );

create or replace function app.guard_role_permissions()
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
     and not app.role_grants(v_row.business_id, v_row.permission_code) then
    raise exception 'You cannot remove a permission you do not hold' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;
