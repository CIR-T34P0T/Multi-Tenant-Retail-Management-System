-- Owner vs manager vs attendant, and protection against privilege escalation.
begin;
\ir helpers.psql
select plan(26);

select tests.create_user('ann@shop-a.test');   -- owner
select tests.create_user('dan@shop-a.test');   -- manager
select tests.create_user('cara@shop-a.test');  -- attendant
select tests.create_user('eve@shop-a.test');   -- second attendant

select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
select tests.business_id('shop-a'), tests.user_id(e), tests.role_id('shop-a', k), 'active', now()
from (values ('dan@shop-a.test', 'manager'), ('cara@shop-a.test', 'attendant'),
             ('eve@shop-a.test', 'attendant')) as v(e, k);

-- ------------------------------------------------------------ attendant (Cara)
select tests.authenticate_as('cara@shop-a.test');
select results_eq($$ select slug from public.businesses $$, $$ values ('shop-a') $$,
  'Attendant can see her business');
select is_empty($$ update public.businesses set name = 'Cara''s shop' returning id $$,
  'Attendant cannot rename the business');
select is_empty($$ update public.business_settings set allow_negative_stock = true returning 1 $$,
  'Attendant cannot change settings');
select throws_ok(format('insert into public.roles (business_id, key, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), 'boss', 'Boss'), '42501', null, 'Attendant cannot create roles');
select is_empty(format('update public.business_members set role_id = %L where id = %L returning 1',
  tests.role_id('shop-a', 'owner'), tests.member_id('shop-a', 'cara@shop-a.test')),
  'Attendant cannot promote herself to owner');
select throws_ok(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'sales'),
  '42501', null, 'Attendant cannot switch modules');
select is_empty($$ select * from public.audit_logs $$, 'Attendant cannot read the audit log');
select results_eq($$ select count(*)::int from public.business_members $$, $$ values (1) $$,
  'Attendant sees only her own membership, not the staff list');
select ok(
  'inventory.stock.view' = any (array(select public.current_user_permissions(tests.business_id('shop-a'))))
  and not ('pricing.price.update' = any (array(select public.current_user_permissions(tests.business_id('shop-a')))))
  and not ('inventory.cost.view' = any (array(select public.current_user_permissions(tests.business_id('shop-a'))))),
  'Attendant can view stock but cannot change prices or see costs');

-- --------------------------------------------------------------- manager (Dan)
select tests.authenticate_as('dan@shop-a.test');
select isnt_empty($$ update public.business_settings set receipt_footer = 'Thank you' returning 1 $$,
  'Manager can change settings');
select throws_ok(format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-a'), 'sales'),
  '42501', null, 'Manager cannot switch modules');
select throws_ok(format('insert into public.roles (business_id, key, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), 'boss', 'Boss'), '42501', null, 'Manager cannot create roles');
select throws_ok(format('update public.business_members set role_id = %L where id = %L',
  tests.role_id('shop-a', 'owner'), tests.member_id('shop-a', 'cara@shop-a.test')),
  '42501', null, 'Manager cannot make someone an owner');
select throws_ok(format('update public.business_members set status = %L where id = %L',
  'suspended', tests.member_id('shop-a', 'ann@shop-a.test')),
  '42501', null, 'Manager cannot suspend the owner');
select throws_ok(format('update public.business_members set status = %L where id = %L',
  'suspended', tests.member_id('shop-a', 'dan@shop-a.test')),
  '42501', null, 'Manager cannot change his own status');
select lives_ok(format('update public.business_members set status = %L where id = %L',
  'suspended', tests.member_id('shop-a', 'eve@shop-a.test')),
  'Manager can suspend an attendant');

select tests.authenticate_as('eve@shop-a.test');
select is_empty($$ select * from public.businesses $$, 'A suspended member immediately loses access');

-- ------------------------------------------- owner creates a powerful role (Ann)
select tests.authenticate_as('ann@shop-a.test');
select lives_ok(format(
  'insert into public.roles (business_id, key, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), 'controller', 'Controller'), 'Owner can create a role');
select lives_ok(format(
  'insert into public.role_permissions (business_id, role_id, permission_code) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.role_id('shop-a', 'controller'), 'core.module.manage'),
  'Owner can grant any permission');

select tests.authenticate_as('dan@shop-a.test');
select throws_ok(format('update public.business_members set role_id = %L where id = %L',
  tests.role_id('shop-a', 'controller'), tests.member_id('shop-a', 'cara@shop-a.test')),
  '42501', null, 'Manager cannot assign a role with permissions he does not hold');
select throws_ok(format(
  'insert into public.role_permissions (business_id, role_id, permission_code) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.role_id('shop-a', 'manager'), 'core.role.manage'),
  '42501', null, 'Manager cannot grant himself extra permissions');

-- ----------------------------------------------------------- owner protections
select tests.authenticate_as('ann@shop-a.test');
select throws_ok(format(
  'insert into public.role_permissions (business_id, role_id, permission_code) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.role_id('shop-a', 'owner'), 'core.member.view'),
  '42501', null, 'The owner role cannot be given explicit permissions');
select throws_ok(format('delete from public.roles where id = %L', tests.role_id('shop-a', 'owner')),
  '42501', null, 'The owner role cannot be deleted');
select throws_ok(format('update public.business_members set role_id = %L where id = %L',
  tests.role_id('shop-a', 'manager'), tests.member_id('shop-a', 'ann@shop-a.test')),
  '42501', null, 'The owner cannot change her own role');

-- Last-owner rule applies to everyone, even trusted server code.
reset role;
select set_config('request.jwt.claims', '', true);
set constraints business_members_keep_owner immediate;
select throws_ok(format('update public.business_members set role_id = %L where id = %L',
  tests.role_id('shop-a', 'manager'), tests.member_id('shop-a', 'ann@shop-a.test')),
  '23514', null, 'A business can never be left without an active owner');

-- A suspended business is closed to all its members.
update public.businesses set status = 'suspended' where slug = 'shop-a';
select tests.authenticate_as('ann@shop-a.test');
select is_empty($$ select * from public.businesses $$, 'Members of a suspended business lose access');

reset role;
select * from finish();
rollback;
