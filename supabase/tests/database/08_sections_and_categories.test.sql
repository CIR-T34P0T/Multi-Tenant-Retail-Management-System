-- Stage 5: sections and categories — rules, archiving, roles and business isolation.
begin;
\ir helpers.psql
select plan(33);

select tests.create_user('ann@shop-a.test');   -- owner A
select tests.create_user('bob@shop-b.test');   -- owner B
select tests.create_user('cara@shop-a.test');  -- attendant A
select tests.create_user('dan@shop-a.test');   -- manager A
select tests.create_user('eve@shop-a.test');   -- member of A with no catalogue permission

select tests.authenticate_as('bob@shop-b.test');
select public.create_business('Shop B', 'shop-b');
insert into public.sections (business_id, name) values (tests.business_id('shop-b'), 'Beverages');
insert into public.categories (business_id, section_id, name)
values (tests.business_id('shop-b'), tests.section_id('shop-b', 'Beverages'), 'Soft drinks');

select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.roles (business_id, key, name) values (tests.business_id('shop-a'), 'cleaner', 'Cleaner');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
select tests.business_id('shop-a'), tests.user_id(e), tests.role_id('shop-a', k), 'active', now()
from (values ('cara@shop-a.test', 'attendant'), ('dan@shop-a.test', 'manager'),
             ('eve@shop-a.test', 'cleaner')) as v(e, k);

-- ------------------------------------------------------------------ owner basics
select lives_ok(format('insert into public.sections (business_id, name, description) values (%L, %L, %L)',
  tests.business_id('shop-a'), 'Groceries', 'Rice, beans and provisions'),
  'Owner can create a section');
select lives_ok(format('insert into public.sections (business_id, name) values (%L, %L)',
  tests.business_id('shop-a'), '  Frozen    Food  '), 'Section names are accepted with messy spacing');
select is((select name from public.sections where id = tests.section_id('shop-a', 'frozen food')), 'Frozen Food',
  'Extra spaces are tidied from names');
select throws_ok(format('insert into public.sections (business_id, name) values (%L, %L)',
  tests.business_id('shop-a'), 'GROCERIES'), '23505', null,
  'Section names are unique in a business, ignoring capitals');
select is((select created_by from public.sections where id = tests.section_id('shop-a', 'Groceries')),
  tests.user_id('ann@shop-a.test'), 'The creator is recorded automatically');

select lives_ok(format('insert into public.categories (business_id, section_id, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.section_id('shop-a', 'Groceries'), 'Rice'), 'Owner can create a category');
select throws_ok(format('insert into public.categories (business_id, section_id, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.section_id('shop-a', 'Groceries'), 'RICE'), '23505', null,
  'Category names are unique within a section');
select lives_ok(format('insert into public.categories (business_id, section_id, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.section_id('shop-a', 'Frozen Food'), 'Rice'),
  'The same category name may exist in a different section');
insert into public.categories (business_id, section_id, name)
values (tests.business_id('shop-a'), tests.section_id('shop-a', 'Groceries'), 'Noodles');

-- ---------------------------------------------------------------------- archiving
update public.categories set status = 'archived' where id = tests.category_id('shop-a', 'Groceries', 'Noodles');
update public.sections set status = 'archived' where id = tests.section_id('shop-a', 'Groceries');
select results_eq(
  format('select status::text, archived_at is not null, archived_by from public.sections where id = %L',
         tests.section_id('shop-a', 'Groceries')),
  format('values (%L, true, %L::uuid)', 'archived', tests.user_id('ann@shop-a.test')),
  'Archiving records when and by whom');
select throws_ok(format('insert into public.categories (business_id, section_id, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.section_id('shop-a', 'Groceries'), 'Beans'), '22023', null,
  'No new categories in an archived section');
select throws_ok(format('update public.categories set section_id = %L where id = %L',
  tests.section_id('shop-a', 'Groceries'), tests.category_id('shop-a', 'Frozen Food', 'Rice')), '22023', null,
  'Categories cannot be moved into an archived section');
update public.sections set status = 'active' where id = tests.section_id('shop-a', 'Groceries');
select is((select archived_at from public.sections where id = tests.section_id('shop-a', 'Groceries')), null,
  'Restoring a section clears its archived details');
select results_eq(
  format('select name, status::text from public.categories where section_id = %L order by name',
         tests.section_id('shop-a', 'Groceries')),
  $$ values ('Noodles', 'archived'), ('Rice', 'active') $$,
  'Each category keeps its own status through archive and restore of its section');
select throws_ok(format('update public.categories set section_id = %L where id = %L',
  tests.section_id('shop-a', 'Groceries'), tests.category_id('shop-a', 'Frozen Food', 'Rice')), '23505', null,
  'A category cannot be moved into a section that already has one with the same name');
insert into public.categories (business_id, section_id, name)
values (tests.business_id('shop-a'), tests.section_id('shop-a', 'Frozen Food'), 'Biscuits');
select lives_ok(format('update public.categories set section_id = %L where id = %L',
  tests.section_id('shop-a', 'Groceries'), tests.category_id('shop-a', 'Frozen Food', 'Biscuits')),
  'A category can be moved to another active section');
select throws_ok(format('delete from public.sections where id = %L', tests.section_id('shop-a', 'Frozen Food')),
  '42501', null, 'Sections cannot be deleted, only archived');
select throws_ok(format('delete from public.categories where id = %L', tests.category_id('shop-a', 'Groceries', 'Noodles')),
  '42501', null, 'Categories cannot be deleted, only archived');
select ok((select count(*) from public.audit_logs where entity_type in ('sections', 'categories')) >= 8,
  'Section and category changes are recorded in the audit log');

-- ------------------------------------------------------------- isolation (as Ann)
select is_empty(format('select * from public.sections where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot see Business B sections');
select is_empty(format('select * from public.categories where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot see Business B categories');
select is_empty(format('update public.sections set name = %L where id = %L returning id', 'Hacked',
  tests.section_id('shop-b', 'Beverages')), 'Ann cannot rename a Business B section');
select throws_ok(format('insert into public.sections (business_id, name) values (%L, %L)',
  tests.business_id('shop-b'), 'Spy'), '42501', null, 'Ann cannot create a section in Business B');
select throws_ok(format('insert into public.categories (business_id, section_id, name) values (%L, %L, %L)',
  tests.business_id('shop-b'), tests.section_id('shop-b', 'Beverages'), 'Spy'), '42501', null,
  'Ann cannot create a category in Business B');
select throws_ok(format('insert into public.categories (business_id, section_id, name) values (%L, %L, %L)',
  tests.business_id('shop-a'), tests.section_id('shop-b', 'Beverages'), 'Mixed'), '23503', null,
  'A category of A cannot be placed in a section of B (composite foreign key)');
select throws_ok(format('update public.categories set section_id = %L where id = %L',
  tests.section_id('shop-b', 'Beverages'), tests.category_id('shop-a', 'Groceries', 'Rice')), '23503', null,
  'A category of A cannot be moved into a section of B');
select throws_ok(format('update public.sections set business_id = %L where id = %L',
  tests.business_id('shop-b'), tests.section_id('shop-a', 'Groceries')), '42501', null,
  'A section cannot be moved to another business');

-- ------------------------------------------------------------- roles inside A
select tests.authenticate_as('cara@shop-a.test');
select results_eq($$ select count(*)::int from public.sections $$, $$ values (2) $$,
  'An attendant can see the sections');
select throws_ok(format('insert into public.sections (business_id, name) values (%L, %L)',
  tests.business_id('shop-a'), 'Household'), '42501', null, 'An attendant cannot create sections');
select is_empty(format('update public.sections set name = %L where id = %L returning 1', 'Renamed',
  tests.section_id('shop-a', 'Groceries')), 'An attendant cannot rename sections');
select is_empty(format('update public.categories set status = %L where id = %L returning 1', 'archived',
  tests.category_id('shop-a', 'Groceries', 'Rice')), 'An attendant cannot archive categories');

select tests.authenticate_as('dan@shop-a.test');
select lives_ok(format('insert into public.sections (business_id, name) values (%L, %L)',
  tests.business_id('shop-a'), 'Household'), 'A manager can create sections');

select tests.authenticate_as('eve@shop-a.test');
select is_empty($$ select * from public.sections $$,
  'A member without catalogue permission sees no sections');

select tests.authenticate_as('bob@shop-b.test');
select results_eq($$ select name from public.sections $$, $$ values ('Beverages') $$,
  'Bob sees only his own business''s sections');

reset role;
select * from finish();
rollback;
