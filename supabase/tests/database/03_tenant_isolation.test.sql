-- Business A and Business B must be completely invisible to each other,
-- including when an attacker supplies the other business's IDs directly.
begin;
\ir helpers.psql
select plan(26);

select tests.create_user('ann@shop-a.test');   -- owner of A
select tests.create_user('bob@shop-b.test');   -- owner of B
select tests.create_user('cara@shop-a.test');  -- attendant at A

select tests.authenticate_as('bob@shop-b.test');
select public.create_business('Shop B', 'shop-b');
update public.business_settings set receipt_footer = 'B footer';

select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
values (tests.business_id('shop-a'), tests.user_id('cara@shop-a.test'),
        tests.role_id('shop-a', 'attendant'), 'active', now());

-- ---------------------------------------------------------------- reads (as Ann)
select results_eq($$ select slug from public.businesses $$, $$ values ('shop-a') $$,
  'Ann sees only her own business');
select is_empty(format('select * from public.businesses where id = %L', tests.business_id('shop-b')),
  'Ann cannot read Business B even with its exact ID');
select is_empty(format('select * from public.business_settings where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot read Business B settings');
select is_empty(format('select * from public.roles where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot read Business B roles');
select is_empty(format('select * from public.role_permissions where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot read Business B role permissions');
select is_empty(format('select * from public.business_members where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot read Business B members');
select is_empty(format('select * from public.business_modules where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot read Business B modules');
select is_empty(format('select * from public.audit_logs where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot read Business B audit log');
select is_empty(format('select * from public.profiles where id = %L', tests.user_id('bob@shop-b.test')),
  'Ann cannot read the profile of someone outside her businesses');
select isnt_empty(format('select * from public.profiles where id = %L', tests.user_id('cara@shop-a.test')),
  'Ann can read her own staff member''s profile');
select is_empty(format('select public.current_user_permissions(%L)', tests.business_id('shop-b')),
  'Ann holds no permissions in Business B');

-- --------------------------------------------------------------- writes (as Ann)
select is_empty(format('update public.businesses set name = %L where id = %L returning id', 'Hacked', tests.business_id('shop-b')),
  'Ann cannot rename Business B (0 rows changed)');
select is_empty(format('update public.business_settings set receipt_footer = %L where business_id = %L returning 1', 'Hacked', tests.business_id('shop-b')),
  'Ann cannot change Business B settings (0 rows changed)');
select throws_ok(
  format('insert into public.roles (business_id, key, name) values (%L, %L, %L)', tests.business_id('shop-b'), 'spy', 'Spy'),
  '42501', null, 'Ann cannot create a role in Business B');
select throws_ok(
  format('insert into public.business_members (business_id, user_id, role_id, status) values (%L, %L, %L, %L)',
         tests.business_id('shop-b'), tests.user_id('ann@shop-a.test'), tests.role_id('shop-b', 'attendant'), 'active'),
  '42501', null, 'Ann cannot add herself to Business B');
select throws_ok(
  format('insert into public.role_permissions (business_id, role_id, permission_code) values (%L, %L, %L)',
         tests.business_id('shop-b'), tests.role_id('shop-b', 'attendant'), 'core.member.view'),
  '42501', null, 'Ann cannot change Business B role permissions');
select throws_ok(
  format('select public.set_module_enabled(%L, %L, true)', tests.business_id('shop-b'), 'sales'),
  '42501', null, 'Ann cannot switch modules in Business B');

-- ------------------------------------------------- ID tampering inside Business A
select throws_ok(
  format('insert into public.business_members (business_id, user_id, role_id, status) values (%L, %L, %L, %L)',
         tests.business_id('shop-a'), tests.user_id('bob@shop-b.test'), tests.role_id('shop-b', 'manager'), 'active'),
  '23503', null, 'A membership in A cannot use a role belonging to B (composite foreign key)');
select throws_ok(
  format('insert into public.role_permissions (business_id, role_id, permission_code) values (%L, %L, %L)',
         tests.business_id('shop-a'), tests.role_id('shop-b', 'attendant'), 'core.member.view'),
  '23503', null, 'A role permission in A cannot point at a role in B (composite foreign key)');
select throws_ok(
  format('update public.business_members set business_id = %L where id = %L',
         tests.business_id('shop-b'), tests.member_id('shop-a', 'cara@shop-a.test')),
  '42501', null, 'A member of A cannot be moved into Business B');
select throws_ok(
  format('update public.roles set business_id = %L where id = %L',
         tests.business_id('shop-b'), tests.role_id('shop-a', 'manager')),
  '42501', null, 'A role of A cannot be moved into Business B');

-- ----------------------------------------------------------------- as Bob
select tests.authenticate_as('bob@shop-b.test');
select results_eq($$ select slug from public.businesses $$, $$ values ('shop-b') $$,
  'Bob sees only his own business');
select is_empty(format('select * from public.business_members where business_id = %L', tests.business_id('shop-a')),
  'Bob cannot read Business A members');
select is_empty(format('select * from public.audit_logs where business_id = %L', tests.business_id('shop-a')),
  'Bob cannot read Business A audit log');

-- ------------------------------------------- verify nothing in B changed
reset role;
select set_config('request.jwt.claims', '', true);
select is((select name from public.businesses where slug = 'shop-b'), 'Shop B', 'Business B name unchanged');
select is((select receipt_footer from public.business_settings where business_id = tests.business_id('shop-b')),
  'B footer', 'Business B settings unchanged');

select * from finish();
rollback;
