-- =============================================================================
-- Stage 4 · Members, invitations and business protections
--
-- How staff join a business (no extra email service needed):
--   1. An owner/manager invites an email address with a role  → invite_member()
--   2. That person signs up (or signs in) with the same, confirmed email
--   3. They see the invitation and accept or decline it       → accept_invitation()
--                                                               decline_invitation()
--   The inviter can withdraw a pending invitation             → cancel_invitation()
--
-- Also:
--   business_member_directory()  staff list with names and emails, for permitted users
--   my_pending_invitations()     invitations waiting for the signed-in user
--   Businesses: currency cannot change after creation; status and creator are
--   platform-controlled (a business could otherwise lock its own owner out).
-- =============================================================================

-- One pending invitation per email per business.
create unique index business_members_pending_invite_key
  on public.business_members (business_id, lower(invited_email))
  where status = 'invited';

-- -----------------------------------------------------------------------------
-- Business protections
-- -----------------------------------------------------------------------------
create function app.guard_businesses()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency_code <> old.currency_code then
    raise exception 'The currency cannot be changed after the business is created'
      using errcode = '22023';
  end if;
  if app.is_client_write()
     and (new.status <> old.status or new.created_by is distinct from old.created_by) then
    raise exception 'Business status is managed by the platform' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger businesses_guard
  before update on public.businesses
  for each row execute function app.guard_businesses();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- The signed-in user's email, only if it has been confirmed.
create function app.current_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email::text)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

revoke all on function app.current_confirmed_email() from public;
grant execute on function app.current_confirmed_email() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- invite_member
-- -----------------------------------------------------------------------------
create function public.invite_member(p_business uuid, p_email text, p_role uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id    uuid;
begin
  if not app.has_permission(p_business, 'core.member.manage') then
    raise exception 'You do not have permission to invite staff' using errcode = '42501';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;

  if not exists (select 1 from public.roles where business_id = p_business and id = p_role) then
    raise exception 'Unknown role' using errcode = '22023';
  end if;

  -- Same rule as direct edits: you cannot hand out more power than you hold.
  if not app.holds_all_permissions_of_role(p_business, p_role) then
    raise exception 'You cannot assign a role with permissions you do not hold'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.business_members m
    join auth.users u on u.id = m.user_id
    where m.business_id = p_business and lower(u.email::text) = v_email
  ) then
    raise exception 'This person is already a member of the business' using errcode = '23505';
  end if;

  begin
    insert into public.business_members (business_id, invited_email, role_id, status, invited_by)
    values (p_business, v_email, p_role, 'invited', (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This email already has a pending invitation' using errcode = '23505';
  end;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- my_pending_invitations
-- -----------------------------------------------------------------------------
create function public.my_pending_invitations()
returns table (
  member_id     uuid,
  business_id   uuid,
  business_name text,
  role_name     text,
  invited_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, b.id, b.name, r.name, m.created_at
  from public.business_members m
  join public.businesses b on b.id = m.business_id and b.status = 'active'
  join public.roles r on r.business_id = m.business_id and r.id = m.role_id
  where m.status = 'invited'
    and lower(m.invited_email) = app.current_confirmed_email()
  order by m.created_at;
$$;

-- -----------------------------------------------------------------------------
-- accept_invitation / decline_invitation
-- -----------------------------------------------------------------------------
create function app.lock_my_invitation(p_member uuid)
returns public.business_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.business_members;
  v_email text := app.current_confirmed_email();
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  select * into v_row from public.business_members where id = p_member for update;

  if not found or v_row.status <> 'invited' or v_email is null
     or lower(v_row.invited_email) <> v_email then
    raise exception 'This invitation is not available' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

revoke all on function app.lock_my_invitation(uuid) from public;

create function public.accept_invitation(p_member uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.business_members := app.lock_my_invitation(p_member);
begin
  if exists (
    select 1 from public.business_members
    where business_id = v_row.business_id and user_id = (select auth.uid())
  ) then
    raise exception 'You are already a member of this business' using errcode = '23505';
  end if;

  update public.business_members
  set user_id = (select auth.uid()), status = 'active', joined_at = now()
  where id = p_member;

  return v_row.business_id;
end;
$$;

create function public.decline_invitation(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.lock_my_invitation(p_member);
  delete from public.business_members where id = p_member;
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_invitation (by the business)
-- -----------------------------------------------------------------------------
create function public.cancel_invitation(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business
  from public.business_members where id = p_member and status = 'invited'
  for update;

  if v_business is null or not app.has_permission(v_business, 'core.member.manage') then
    raise exception 'This invitation is not available' using errcode = '42501';
  end if;

  delete from public.business_members where id = p_member;
end;
$$;

-- -----------------------------------------------------------------------------
-- business_member_directory — names and emails of staff (permitted users only)
-- -----------------------------------------------------------------------------
create function public.business_member_directory(p_business uuid)
returns table (
  member_id  uuid,
  user_id    uuid,
  full_name  text,
  email      text,
  role_id    uuid,
  role_name  text,
  role_key   text,
  is_owner   boolean,
  status     public.member_status,
  joined_at  timestamptz,
  invited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission(p_business, 'core.member.view')
          or app.has_permission(p_business, 'core.member.manage')) then
    raise exception 'You do not have permission to view staff' using errcode = '42501';
  end if;

  return query
  select m.id, m.user_id, coalesce(p.full_name, ''), coalesce(u.email::text, m.invited_email),
         r.id, r.name, r.key, r.is_owner, m.status, m.joined_at, m.created_at
  from public.business_members m
  join public.roles r on r.business_id = m.business_id and r.id = m.role_id
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.business_id = p_business
  order by r.is_owner desc, m.status, coalesce(nullif(p.full_name, ''), u.email::text, m.invited_email);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function
  public.invite_member(uuid, text, uuid),
  public.my_pending_invitations(),
  public.accept_invitation(uuid),
  public.decline_invitation(uuid),
  public.cancel_invitation(uuid),
  public.business_member_directory(uuid)
from public, anon;

grant execute on function
  public.invite_member(uuid, text, uuid),
  public.my_pending_invitations(),
  public.accept_invitation(uuid),
  public.decline_invitation(uuid),
  public.cancel_invitation(uuid),
  public.business_member_directory(uuid)
to authenticated;
