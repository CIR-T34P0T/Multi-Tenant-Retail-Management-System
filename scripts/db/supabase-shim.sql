-- =============================================================================
-- TEST-ONLY shim: makes a plain PostgreSQL database look like Supabase for the
-- parts our migrations rely on (roles, auth.users, auth.uid(), default grants).
--
-- Used by scripts/db/test-local.sh when Docker/Supabase is not available.
-- NEVER run this against a real Supabase project — it already has all of this.
-- CI runs the same tests against the real Supabase stack.
-- =============================================================================
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create schema extensions;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;

create table auth.users (
  id                  uuid primary key,
  email               text,
  raw_user_meta_data  jsonb not null default '{}',
  created_at          timestamptz not null default now()
);

-- Same logic as Supabase's auth.uid(): read the user id from the request's JWT claims.
create function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants these by default on everything created in `public`
-- and relies on RLS. Reproduce it so our explicit revokes are really tested.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create extension if not exists pgcrypto;
