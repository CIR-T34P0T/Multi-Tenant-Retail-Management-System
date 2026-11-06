-- =============================================================================
-- Stage 3 · Migration 1 of 5 — Foundation
--
-- Creates:
--   * schema `app`      private helper functions (not exposed through the API)
--   * enum types        shared status values
--   * app.set_updated_at()   trigger that maintains updated_at columns
--   * audit_logs        append-only record of important changes
--   * app.audit_row_change() trigger that writes audit_logs
--
-- Plain-language summary: this is the toolbox the rest of the database uses.
-- See docs/database/README.md for the full migration guide.
-- =============================================================================

-- Private schema for helper functions. Supabase's API only exposes `public`,
-- so nothing here can be called directly from the browser.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Shared enum types
-- -----------------------------------------------------------------------------
create type public.record_status as enum ('active', 'inactive', 'archived');
create type public.member_status as enum ('invited', 'active', 'suspended');

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id            bigint generated always as identity primary key,
  business_id   uuid,                -- null only for platform-level events
  actor_user_id uuid,                -- auth.uid() of whoever made the change (null = system)
  action        text not null,       -- 'insert' | 'update' | 'delete' | semantic e.g. 'module.enabled'
  entity_type   text not null,       -- table or concept name
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only log of important changes. Written only by triggers/functions; never edited.';

create index audit_logs_business_time_idx on public.audit_logs (business_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;
-- Read policy is added with the security helpers (migration 4).
-- Nobody using the API may write, change or delete audit entries.
revoke all on public.audit_logs from anon;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;

-- Generic trigger: records INSERT/UPDATE/DELETE on the table it is attached to.
-- SECURITY DEFINER so it can write audit_logs even though users cannot.
create function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_business uuid;
  v_entity   uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  -- Skip updates that changed nothing except housekeeping columns.
  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'updated_by') = (v_new - 'updated_at' - 'updated_by') then
    return null;
  end if;

  if tg_table_name = 'businesses' then
    v_business := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  else
    v_business := coalesce(v_new ->> 'business_id', v_old ->> 'business_id')::uuid;
  end if;

  -- Tables keyed by something other than `id` (e.g. role_permissions) log entity_id = null;
  -- the full row is still in before/after.
  v_entity := nullif(coalesce(v_new ->> 'id', v_old ->> 'id'), '')::uuid;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (v_business, auth.uid(), lower(tg_op), tg_table_name, v_entity, v_old, v_new);

  return null;
end;
$$;

revoke all on function app.audit_row_change() from public;
