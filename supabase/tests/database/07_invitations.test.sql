-- Staff invitations, the staff directory and business protections.
begin;
\ir helpers.psql
select plan(26);

select tests.create_user('ann@shop-a.test');     -- owner
select tests.create_user('dan@shop-a.test');     -- manager
select tests.create_user('cara@shop-a.test');    -- will be invited as attendant
select tests.create_user('bob@shop-b.test');     -- outsider
select tests.create_unconfirmed_user('fake@shop-a.test');

select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
values (tests.business_id('shop-a'), tests.user_id('dan@shop-a.test'), tests.role_id('shop-a', 'manager'), 'active', now());

-- ------------------------------------------------------------------ inviting
select lives_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  '  Cara@Shop-A.test ', tests.role_id('shop-a', 'attendant')), 'Owner can invite by email');
select is((select invited_email from public.business_members where status = 'invited'), 'cara@shop-a.test',
  'The email is stored in lowercase without spaces');
select throws_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  'cara@shop-a.test', tests.role_id('shop-a', 'attendant')), '23505', null, 'The same email cannot be invited twice');
select throws_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  'dan@shop-a.test', tests.role_id('shop-a', 'attendant')), '23505', null, 'Existing members cannot be invited again');
select throws_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  'not-an-email', tests.role_id('shop-a', 'attendant')), '22023', null, 'Invalid email addresses are rejected');
select lives_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  'fake@shop-a.test', tests.role_id('shop-a', 'attendant')), 'An invitation can be sent to any address');

select tests.authenticate_as('dan@shop-a.test');
select throws_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  'eve@shop-a.test', tests.role_id('shop-a', 'owner')), '42501', null, 'A manager cannot invite someone as owner');
select lives_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  'eve@shop-a.test', tests.role_id('shop-a', 'attendant')), 'A manager can invite an attendant');

select tests.authenticate_as('bob@shop-b.test');
select throws_ok(format('select public.invite_member(%L, %L, %L)', tests.business_id('shop-a'),
  'spy@shop-b.test', tests.role_id('shop-a', 'manager')), '42501', null, 'Outsiders cannot invite into Business A');
select is_empty($$ select * from public.my_pending_invitations() $$, 'Bob has no invitations');
select throws_ok(format('select public.accept_invitation(%L)',
  (select id from public.business_members where invited_email = 'cara@shop-a.test')),
  '42501', null, 'Bob cannot accept an invitation meant for someone else');

-- --------------------------------------------------------- unconfirmed email
select tests.authenticate_as('fake@shop-a.test');
select is_empty($$ select * from public.my_pending_invitations() $$,
  'Someone with an unconfirmed email sees no invitations');
reset role;
select set_config('request.jwt.claims', '', true);
select tests.authenticate_as('fake@shop-a.test');
select throws_ok(format('select public.accept_invitation(%L)', tests.member_id('shop-a', 'nobody')),
  '42501', null, 'Unconfirmed emails cannot accept invitations');

-- ---------------------------------------------------------------- accepting
select tests.authenticate_as('cara@shop-a.test');
select results_eq($$ select business_name, role_name from public.my_pending_invitations() $$,
  $$ values ('Shop A', 'Attendant') $$, 'Cara sees her invitation with the business and role');
select is_empty($$ select * from public.businesses $$, 'Before accepting, Cara cannot see the business');
select lives_ok($$ select public.accept_invitation(member_id) from public.my_pending_invitations() $$,
  'Cara accepts the invitation');
-- On a real save the "keep an owner" check runs at commit, as Cara. Tests roll back,
-- so run the pending check now, still as Cara (regression: it could not see the owner).
select lives_ok($$ set constraints all immediate $$,
  'The end-of-save owner check passes for a new attendant who cannot see the owner');
select results_eq($$ select slug from public.businesses $$, $$ values ('shop-a') $$,
  'After accepting, Cara is a member and sees the business');
select is_empty($$ select * from public.my_pending_invitations() $$, 'The invitation is used up');
select throws_ok(format('select public.business_member_directory(%L)', tests.business_id('shop-a')),
  '42501', null, 'An attendant cannot read the staff directory');

-- ------------------------------------------------------- directory & cancel
select tests.authenticate_as('ann@shop-a.test');
select results_eq(
  format($$ select email, role_key, status::text from public.business_member_directory(%L) where email = 'cara@shop-a.test' $$,
         tests.business_id('shop-a')),
  $$ values ('cara@shop-a.test', 'attendant', 'active') $$, 'The owner sees staff names, emails, roles and status');
select lives_ok($$ select public.cancel_invitation(id) from public.business_members where invited_email = 'eve@shop-a.test' $$,
  'The owner can withdraw a pending invitation');
select is((select count(*)::int from public.business_members where status = 'invited'), 1,
  'Only the unconfirmed invitation remains pending');

select lives_ok(format(
  'insert into public.role_permissions (business_id, role_id, permission_code) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.role_id('shop-a', 'attendant'), 'sales.sale.view_all'),
  'The owner can add Sales permissions to a role while Sales is switched off');

-- ------------------------------------------------------- business protections
select throws_ok($$ update public.businesses set currency_code = 'USD' $$, '22023', null,
  'The currency cannot be changed after creation');
select throws_ok($$ update public.businesses set status = 'closed' $$, '42501', null,
  'A business cannot change its own status (it would lock the owner out)');

reset role;
select * from finish();
rollback;
