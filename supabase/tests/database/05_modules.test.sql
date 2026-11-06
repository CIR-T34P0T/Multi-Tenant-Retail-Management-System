-- Optional modules: dependency rules, effect on permissions, no data loss.
begin;
\ir helpers.psql
select plan(17);

select tests.create_user('ann@shop-a.test');
select tests.create_user('cara@shop-a.test');
select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
values (tests.business_id('shop-a'), tests.user_id('cara@shop-a.test'),
        tests.role_id('shop-a', 'attendant'), 'active', now());

create temporary view t_enabled as
  select module_code from public.business_modules where is_enabled order by module_code;
grant select on t_enabled to authenticated;

select throws_like(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'credit'),
  '%needs%', 'Credit cannot be enabled before Sales and Customers');
select lives_ok(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'sales'),
  'Owner can enable Sales');
select throws_like(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'credit'),
  '%Customers%', 'Credit still needs Customers');
select lives_ok(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'customers'),
  'Owner can enable Customers');
select lives_ok(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'credit'),
  'Credit can be enabled once Sales and Customers are on');
select results_eq($$ select * from t_enabled $$, $$ values ('credit'), ('customers'), ('sales') $$,
  'Exactly Sales, Customers and Credit are on');

select throws_like(format('select public.set_module_enabled(%L, %L, false)', tests.business_id('shop-a'), 'sales'),
  '%Disable Credit first%', 'Sales cannot be disabled while Credit needs it');
select throws_like(format('select public.set_module_enabled(%L, %L, false)', tests.business_id('shop-a'), 'customers'),
  '%Disable Credit first%', 'Customers cannot be disabled while Credit needs it');
select throws_ok(format('select public.set_module_enabled(%L, %L, false)', tests.business_id('shop-a'), 'inventory'),
  '22023', null, 'Core modules cannot be disabled');
select throws_ok(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'teleport'),
  '22023', null, 'Unknown modules are rejected');
select throws_ok(format('update public.business_modules set is_enabled = true where business_id = %L',
  tests.business_id('shop-a')), '42501', null, 'Modules cannot be switched by editing the table directly');

select tests.authenticate_as('cara@shop-a.test');
select ok('sales.pos.use' = any (array(select public.current_user_permissions(tests.business_id('shop-a')))),
  'With Sales on, the attendant can use the point of sale');

select tests.authenticate_as('ann@shop-a.test');
select lives_ok(format('select public.set_module_enabled(%L, %L, false)', tests.business_id('shop-a'), 'credit'),
  'Credit can be disabled');
select lives_ok(format('select public.set_module_enabled(%L, %L, false)', tests.business_id('shop-a'), 'sales'),
  'Sales can be disabled once Credit is off');

select tests.authenticate_as('cara@shop-a.test');
select ok(not ('sales.pos.use' = any (array(select public.current_user_permissions(tests.business_id('shop-a'))))),
  'With Sales off, the attendant loses point-of-sale permission');

select tests.authenticate_as('ann@shop-a.test');
select results_eq(
  $$ select count(*)::int, bool_and(disabled_at is not null) from public.business_modules
     where module_code in ('sales', 'credit') $$,
  $$ values (2, true) $$, 'Disabling keeps the module records (no data is deleted)');
select ok(
  (select count(*) from public.audit_logs where entity_type = 'business_modules' and action = 'update') >= 5,
  'Every module change is recorded in the audit log');

reset role;
select * from finish();
rollback;
