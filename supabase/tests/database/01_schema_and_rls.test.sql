-- Structural security checks: every table protected, anon locked out,
-- reference data consistent.
begin;
\ir helpers.psql
select plan(17);

select tables_are('public', array[
  'audit_logs', 'business_members', 'business_modules', 'business_settings', 'businesses',
  'categories', 'modules', 'permissions', 'product_units', 'product_variants', 'products',
  'profiles', 'role_permissions', 'role_template_permissions', 'role_templates', 'roles',
  'sections', 'stock_count_lines', 'stock_counts', 'stock_levels', 'stock_movements', 'units',
  'variant_costs', 'variant_prices'
], 'The database has exactly the expected public tables');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'Row-Level Security is enabled on every public table');

select is_empty($$
  select table_name, privilege_type from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
$$, 'Signed-out visitors (anon) have no privileges on any public table');

select is_empty($$
  select privilege_type from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public' and table_name = 'audit_logs'
    and privilege_type <> 'SELECT'
$$, 'Signed-in users can only read audit_logs, never write them');

select is_empty($$
  select privilege_type from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public' and table_name = 'business_modules'
    and privilege_type <> 'SELECT'
$$, 'business_modules can only be changed through set_module_enabled()');

select is_empty($$
  select privilege_type from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and table_name in ('modules', 'permissions', 'role_templates', 'role_template_permissions')
    and privilege_type <> 'SELECT'
$$, 'Reference data is read-only for users');

select is_empty($$
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.oid and i.indkey[0] = a.attnum
    )
$$, 'Every table with business_id has an index leading with business_id');

select is((select count(*)::int from public.modules), 13, '13 modules registered');
select is((select count(*)::int from public.modules where is_core), 5, '5 of them are core');

select is_empty($$
  select m.code, r.code from public.modules m, unnest(m.requires) as r(code)
  where not exists (select 1 from public.modules x where x.code = r.code)
$$, 'Module requirements only reference existing modules');

select is_empty($$
  select m.code from public.modules m, unnest(m.requires) as r(code)
  join public.modules d on d.code = r.code
  where m.is_core and not d.is_core
$$, 'No core module depends on an optional module');

select is_empty($$
  select tp.permission_code from public.role_template_permissions tp
  join public.permissions p on p.code = tp.permission_code
  where tp.template_key = 'attendant' and p.is_sensitive
$$, 'The attendant template has no sensitive permissions');

select ok(
  not exists (select 1 from public.role_template_permissions
              where template_key = 'manager' and permission_code = 'sales.sale.cancel'),
  'Only owners can cancel sales by default (decision Q3)');

select ok(not has_function_privilege('anon', 'public.create_business(text,text,text,text,text)', 'execute'),
  'anon cannot call create_business');
select ok(not has_function_privilege('anon', 'app.has_permission(uuid,text)', 'execute'),
  'anon cannot call security helper functions');

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.businesses $$, '42501', null,
  'anon querying businesses is refused outright');
select throws_ok($$ select public.create_business('Shop X', 'shop-x') $$, '42501', null,
  'anon cannot create a business');
reset role;

select * from finish();
rollback;
