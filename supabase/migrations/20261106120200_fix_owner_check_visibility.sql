-- =============================================================================
-- Stage 4 · Fix: "a business must keep one active owner" check could not see the owner
--
-- Found by the end-to-end tests: the check runs when the transaction is saved,
-- as the user who made the change. An attendant accepting an invitation may only
-- see their own membership (RLS), so the check found no owner and refused.
-- The pgTAP tests never save (they roll back), so they did not trigger it.
--
-- The check is a pure integrity rule, so it must see every row: run it as the
-- table owner (SECURITY DEFINER). It reveals nothing to the user.
-- =============================================================================

create or replace function app.ensure_business_has_owner()
returns trigger
language plpgsql
security definer
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

revoke all on function app.ensure_business_has_owner() from public;
