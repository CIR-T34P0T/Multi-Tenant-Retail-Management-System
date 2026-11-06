-- Creating a business: the caller becomes Owner and everything is seeded.
begin;
\ir helpers.psql
select plan(16);

select tests.create_user('ann@shop-a.test');

select tests.authenticate_as('ann@shop-a.test');
select lives_ok($$ select public.create_business('Shop A', 'shop-a') $$, 'A signed-in user can create a business');

select is((select count(*)::int from public.businesses), 1, 'The new owner sees their business');
select is(
  (select r.key from public.business_members m join public.roles r on r.id = m.role_id
   where m.user_id = tests.user_id('ann@shop-a.test')),
  'owner', 'The creator is a member with the owner role');
select is((select status::text from public.business_members where user_id = tests.user_id('ann@shop-a.test')),
  'active', 'The owner membership is active');
select is((select allow_negative_stock from public.business_settings), false,
  'Settings row created with safe defaults');
select results_eq(
  $$ select count(*)::int, count(*) filter (where is_enabled)::int from public.business_modules $$,
  $$ values (8, 0) $$, 'All 8 optional modules start switched off');
select bag_eq($$ select key from public.roles $$, array['owner', 'manager', 'attendant'],
  'Owner, Manager and Attendant roles are created');
select is(
  (select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.key = 'attendant'), 11, 'Attendant role gets its 11 default permissions');
select ok(
  'core.module.manage' = any (array(select public.current_user_permissions(tests.business_id('shop-a')))),
  'The owner holds core permissions');
select ok(
  not ('sales.pos.use' = any (array(select public.current_user_permissions(tests.business_id('shop-a'))))),
  'Even the owner has no Sales permissions while Sales is off');
select is((select full_name from public.profiles where id = tests.user_id('ann@shop-a.test')), 'ann',
  'A profile was created automatically at sign-up');

select throws_ok($$ insert into public.businesses (name, slug) values ('Sneaky', 'sneaky') $$,
  '42501', null, 'Businesses cannot be inserted directly, only through create_business()');
select throws_ok($$ select public.create_business('Copy', 'SHOP-A') $$, '23505', null,
  'Business addresses are unique (case-insensitive)');
select throws_ok($$ select public.create_business('Bad', 'a b') $$, '23514', null,
  'Business address format is validated');
select throws_ok($$ select public.create_business('Bad TZ', 'bad-tz', 'Mars/Olympus') $$, '22023', null,
  'Unknown time zones are rejected');
select ok(
  exists (select 1 from public.audit_logs
          where entity_type = 'businesses' and action = 'insert'
            and actor_user_id = tests.user_id('ann@shop-a.test')),
  'Business creation is recorded in the audit log with the creator');

reset role;
select * from finish();
rollback;
