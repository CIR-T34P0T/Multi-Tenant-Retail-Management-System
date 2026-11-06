-- The audit log records who changed what, and cannot be altered.
begin;
\ir helpers.psql
select plan(7);

select tests.create_user('ann@shop-a.test');
select tests.create_user('cara@shop-a.test');
select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
values (tests.business_id('shop-a'), tests.user_id('cara@shop-a.test'),
        tests.role_id('shop-a', 'attendant'), 'active', now());

update public.business_settings set receipt_footer = 'Thank you for shopping';

select results_eq(
  $$ select actor_user_id, before ->> 'receipt_footer', after ->> 'receipt_footer'
     from public.audit_logs where entity_type = 'business_settings' and action = 'update' $$,
  format($$ values (%L::uuid, '', 'Thank you for shopping') $$, tests.user_id('ann@shop-a.test')),
  'A settings change is logged with the person, the old value and the new value');
select ok(
  exists (select 1 from public.audit_logs where entity_type = 'business_members' and action = 'insert'
          and after ->> 'user_id' = tests.user_id('cara@shop-a.test')::text),
  'Adding a staff member is logged');

select throws_ok($$ update public.audit_logs set action = 'nothing' $$, '42501', null,
  'Even the owner cannot edit the audit log');
select throws_ok($$ delete from public.audit_logs $$, '42501', null,
  'Even the owner cannot delete audit entries');
select throws_ok(format($$ insert into public.audit_logs (business_id, action, entity_type) values (%L, 'fake', 'x') $$,
  tests.business_id('shop-a')), '42501', null, 'Nobody can write fake audit entries');

update public.business_settings set receipt_footer = 'Thank you for shopping';
select is((select count(*)::int from public.audit_logs where entity_type = 'business_settings' and action = 'update'), 1,
  'Saving without changes does not create noise in the log');

select tests.authenticate_as('cara@shop-a.test');
select is_empty($$ select * from public.audit_logs $$, 'Staff without permission cannot read the audit log');

reset role;
select * from finish();
rollback;
