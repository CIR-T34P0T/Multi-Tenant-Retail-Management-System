-- Stage 7: core inventory — the stock ledger, balances, negative-stock policy,
-- unit conversions, write-offs, stock counts, reconciliation, roles and
-- business isolation.
begin;
\ir helpers.psql
select plan(86);

select tests.create_user('ann@shop-a.test');   -- owner A
select tests.create_user('bob@shop-b.test');   -- owner B
select tests.create_user('cara@shop-a.test');  -- attendant A
select tests.create_user('dan@shop-a.test');   -- manager A

-- ------------------------------------------------------------------ Business B
select tests.authenticate_as('bob@shop-b.test');
select public.create_business('Shop B', 'shop-b');
insert into public.sections (business_id, name) values (tests.business_id('shop-b'), 'Beverages');
select public.create_product(tests.business_id('shop-b'), jsonb_build_object(
  'section_id', tests.section_id('shop-b', 'Beverages'), 'name', 'Cola 50cl',
  'base_unit_id', tests.unit_id('shop-b', 'pc'),
  'variants', jsonb_build_array(jsonb_build_object('sku', 'COLA-50'))));
select public.record_stock_movement(tests.variant_id('shop-b', 'COLA-50'), 'opening',
  tests.unit_id('shop-b', 'pc'), 40);

-- ------------------------------------------------------------------ Business A
select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
select tests.business_id('shop-a'), tests.user_id(e), tests.role_id('shop-a', k), 'active', now()
from (values ('cara@shop-a.test', 'attendant'), ('dan@shop-a.test', 'manager')) as v(e, k);
insert into public.sections (business_id, name)
values (tests.business_id('shop-a'), 'Beverages'), (tests.business_id('shop-a'), 'Groceries'),
       (tests.business_id('shop-a'), 'Islamic Wear');
select public.create_product(tests.business_id('shop-a'), jsonb_build_object(
  'section_id', tests.section_id('shop-a', 'Beverages'), 'name', 'Malt 33cl',
  'base_unit_id', tests.unit_id('shop-a', 'pc'),
  'units', jsonb_build_array(jsonb_build_object('unit_id', tests.unit_id('shop-a', 'ctn'), 'factor', '12')),
  'variants', jsonb_build_array(jsonb_build_object('sku', 'MALT'))));
select public.create_product(tests.business_id('shop-a'), jsonb_build_object(
  'section_id', tests.section_id('shop-a', 'Beverages'), 'name', 'Water 75cl',
  'base_unit_id', tests.unit_id('shop-a', 'pc'),
  'variants', jsonb_build_array(jsonb_build_object('sku', 'WATER'))));
select public.create_product(tests.business_id('shop-a'), jsonb_build_object(
  'section_id', tests.section_id('shop-a', 'Groceries'), 'name', 'Rice (loose)',
  'base_unit_id', tests.unit_id('shop-a', 'kg'),
  'variants', jsonb_build_array(jsonb_build_object('sku', 'RICE-KG'))));
select public.create_product(tests.business_id('shop-a'), jsonb_build_object(
  'section_id', tests.section_id('shop-a', 'Islamic Wear'), 'name', 'Jalab',
  'base_unit_id', tests.unit_id('shop-a', 'pc'), 'option_names', jsonb_build_array('Size'),
  'variants', jsonb_build_array(
    jsonb_build_object('sku', 'JAL-M', 'option_values', jsonb_build_array('M'), 'min_stock_level', '5'),
    jsonb_build_object('sku', 'JAL-L', 'option_values', jsonb_build_array('L')))));

-- ------------------------------------------------------------ balances exist
select is((select count(*)::int from public.stock_levels where business_id = tests.business_id('shop-a')), 5,
  'Every new variant gets a stock balance automatically');
select is(tests.on_hand('shop-a', 'MALT'), 0::numeric, 'A new item starts with zero stock');

-- ------------------------------------------------------------ opening stock
select is((public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'opening',
  tests.unit_id('shop-a', 'ctn'), 2) ->> 'balance_after')::numeric, 24::numeric,
  'Opening stock of 2 cartons of 12 = 24 pieces');
select results_eq(
  format($$select movement_type::text, quantity, balance_before, balance_after, entered_quantity, factor,
                  created_by = tests.user_id('ann@shop-a.test')
           from public.stock_movements where variant_id = %L$$, tests.variant_id('shop-a', 'MALT')),
  $$values ('opening', 24::numeric, 0::numeric, 24::numeric, 2::numeric, 12::numeric, true)$$,
  'The ledger records type, base quantity, balances, what was entered and who');
select throws_ok(format($$select public.record_stock_movement(%L, 'opening', %L, 5)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023', null,
  'Opening stock can only be entered once per item');

-- ------------------------------------------------------------ add and deduct
select is((public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'stock_in',
  tests.unit_id('shop-a', 'pc'), 6) ->> 'balance_after')::numeric, 30::numeric, 'Adding 6 pieces gives 30');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_out', %L, 5)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023', 'Give a reason',
  'Deducting stock needs a reason');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_out', %L, 5, '   ')$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023', 'Give a reason',
  'A blank reason is not a reason');
select is((public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'stock_out',
  tests.unit_id('shop-a', 'pc'), 5, 'Used for shop guests') ->> 'balance_after')::numeric, 25::numeric,
  'Deducting 5 with a reason gives 25');
select is((select reason from public.stock_movements where variant_id = tests.variant_id('shop-a', 'MALT')
           and movement_type = 'stock_out'), 'Used for shop guests', 'The reason is kept with the movement');

-- ------------------------------------------------------------ write-offs
select is((public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'damaged',
  tests.unit_id('shop-a', 'ctn'), 1, 'Carton dropped') ->> 'balance_after')::numeric, 13::numeric,
  'Writing off 1 damaged carton removes 12 pieces');
select public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'expired', tests.unit_id('shop-a', 'pc'), 1, 'Past date');
select public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'missing', tests.unit_id('shop-a', 'pc'), 1, 'Not found on shelf');
select public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'written_off', tests.unit_id('shop-a', 'pc'), 1, 'Given to charity');
select is(tests.on_hand('shop-a', 'MALT'), 10::numeric, 'Expired, missing and other write-offs each reduce stock');
select is((select array_agg(quantity::int order by seq) from public.stock_movements
           where variant_id = tests.variant_id('shop-a', 'MALT') and movement_type in ('damaged', 'expired', 'missing', 'written_off')),
  array[-12, -1, -1, -1], 'Write-offs are stored as reductions');
select throws_ok(format($$select public.record_stock_movement(%L, 'damaged', %L, 1)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023', 'Give a reason',
  'Write-offs need a reason');

-- ------------------------------------------------------------ quantities and units
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 0)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023', null, 'Zero is refused');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, -3)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023', null,
  'Negative quantities are refused (deduct instead)');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 1.5)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023',
  'This item is counted in whole numbers', 'Half a bottle is refused');
select is((public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'stock_in',
  tests.unit_id('shop-a', 'ctn'), 0.5) ->> 'balance_after')::numeric, 16::numeric,
  'Half a carton of 12 (6 pieces) is accepted');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 0.1)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'ctn')), '22023',
  'This item is counted in whole numbers', 'A tenth of a carton (1.2 pieces) is refused');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 2)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'bag')), '22023',
  'This product is not counted in that unit', 'Units the product does not use are refused');
select is((public.record_stock_movement(tests.variant_id('shop-a', 'RICE-KG'), 'opening',
  tests.unit_id('shop-a', 'kg'), 12.75) ->> 'balance_after')::numeric, 12.75::numeric,
  'Goods counted in kilograms accept fractions');
select is((public.record_stock_movement(tests.variant_id('shop-a', 'RICE-KG'), 'stock_out',
  tests.unit_id('shop-a', 'kg'), 0.125, 'Sample') ->> 'balance_after')::numeric, 12.625::numeric,
  'Fractional deductions are exact');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 1.23456)$$,
  tests.variant_id('shop-a', 'RICE-KG'), tests.unit_id('shop-a', 'kg')), '22023',
  'Use at most 4 decimal places', 'More than 4 decimal places is refused');
select throws_ok(format($$select public.record_stock_movement(%L, 'count', %L, 1)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '22023', null,
  'Count differences can only come from a stock count');

-- ------------------------------------------------------------ negative stock policy
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_out', %L, 17, 'Too many')$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), 'RB001',
  'Not enough stock: only 16 available', 'Going below zero is refused when the business does not allow it');
select is(tests.on_hand('shop-a', 'MALT'), 16::numeric, 'A refused change leaves stock untouched');
update public.business_settings set allow_negative_stock = true where business_id = tests.business_id('shop-a');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_out', %L, 17, 'Too many')$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), 'RB002', null,
  'When negative stock is allowed, the person must still confirm');
select is((public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'stock_out',
  tests.unit_id('shop-a', 'pc'), 17, 'Sold before delivery was entered', true) ->> 'balance_after')::numeric,
  -1::numeric, 'After confirming, stock may go below zero');
select is((public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'stock_in',
  tests.unit_id('shop-a', 'pc'), 1) ->> 'balance_after')::numeric, 0::numeric,
  'Adding stock to a negative balance needs no confirmation');

-- ------------------------------------------------------------ ledger is permanent
select throws_ok($$update public.stock_movements set quantity = 100$$, '42501', null,
  'Nobody can edit a movement through the API');
select throws_ok($$delete from public.stock_movements$$, '42501', null,
  'Nobody can delete a movement through the API');
select throws_ok(format($$insert into public.stock_movements (business_id, variant_id, movement_type, quantity,
    balance_before, balance_after, entered_unit_id, entered_quantity, factor)
  values (%L, %L, 'stock_in', 5, 0, 5, %L, 5, 1)$$, tests.business_id('shop-a'),
  tests.variant_id('shop-a', 'WATER'), tests.unit_id('shop-a', 'pc')), '42501', null,
  'Movements cannot be written directly, only through the stock functions');
select throws_ok($$update public.stock_levels set on_hand = 1000$$, '42501', null,
  'Balances cannot be changed directly');
reset role;
select throws_ok($$update public.stock_movements set reason = 'tampered'$$, '42501', null,
  'Even a database administrator cannot change a movement (trigger)');
select throws_ok($$delete from public.stock_movements$$, '42501', null,
  'Even a database administrator cannot delete a movement (trigger)');
select tests.authenticate_as('ann@shop-a.test');

-- ------------------------------------------------------------ archived items
update public.product_variants set status = 'archived' where id = tests.variant_id('shop-a', 'JAL-L');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 1)$$,
  tests.variant_id('shop-a', 'JAL-L'), tests.unit_id('shop-a', 'pc')), '22023', null,
  'Archived items cannot have stock changes');
select public.record_stock_movement(tests.variant_id('shop-a', 'JAL-M'), 'opening', tests.unit_id('shop-a', 'pc'), 3);

-- ------------------------------------------------------------ overview and alerts
select results_eq(
  format($$select sku, on_hand, stock_status from public.stock_overview(%L) order by sku$$, tests.business_id('shop-a')),
  $$values ('JAL-M', 3::numeric, 'low'), ('MALT', 0::numeric, 'out'), ('RICE-KG', 12.625::numeric, 'ok'),
           ('WATER', 0::numeric, 'out')$$,
  'The overview shows each active item with its stock and status (low = at or below its minimum)');
select is((select array_agg(sku order by sku) from public.stock_overview(tests.business_id('shop-a'), p_status => 'out')),
  array['MALT', 'WATER'], 'Filter: out of stock');
select is((select array_agg(sku) from public.stock_overview(tests.business_id('shop-a'), p_status => 'low')),
  array['JAL-M'], 'Filter: low stock');
select is((select array_agg(sku) from public.stock_overview(tests.business_id('shop-a'), p_q => 'rice')),
  array['RICE-KG'], 'Search by name');
select is((select array_agg(sku) from public.stock_overview(tests.business_id('shop-a'), p_q => 'jal-m')),
  array['JAL-M'], 'Search by product code');
select is((select array_agg(sku order by sku) from public.stock_overview(tests.business_id('shop-a'),
  p_section => tests.section_id('shop-a', 'Beverages'))), array['MALT', 'WATER'], 'Filter by section');
select is((select array_agg(sku) from public.stock_overview(tests.business_id('shop-a'), p_archived => true)),
  array['JAL-L'], 'Archived items are listed separately');
select is((select total_count from public.stock_overview(tests.business_id('shop-a'), p_limit => 1) limit 1),
  4::bigint, 'Paging reports the total number of matches');
select results_eq(format($$select items, low, out_of_stock, negative from public.stock_summary(%L)$$, tests.business_id('shop-a')),
  $$values (4::bigint, 1::bigint, 2::bigint, 0::bigint)$$, 'Summary: items, low, out of stock, negative');

-- ------------------------------------------------------------ roles
select tests.authenticate_as('cara@shop-a.test');
select ok((select count(*) from public.stock_levels) = 5 and (select count(*) from public.stock_movements) > 0,
  'An attendant can see stock and its history');
select is((select count(*)::int from public.stock_overview(tests.business_id('shop-a'))), 4,
  'An attendant can see the stock overview');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 5)$$,
  tests.variant_id('shop-a', 'WATER'), tests.unit_id('shop-a', 'pc')), '42501', null,
  'An attendant cannot add stock by hand (default permissions)');
select throws_ok(format($$select public.record_stock_movement(%L, 'damaged', %L, 1, 'x')$$,
  tests.variant_id('shop-a', 'RICE-KG'), tests.unit_id('shop-a', 'kg')), '42501', null,
  'An attendant cannot write off stock (default permissions)');
select tests.authenticate_as('dan@shop-a.test');
select lives_ok(format($$select public.record_stock_movement(%L, 'opening', %L, 24)$$,
  tests.variant_id('shop-a', 'WATER'), tests.unit_id('shop-a', 'pc')), 'A manager can enter stock');
select lives_ok(format($$select public.record_stock_movement(%L, 'missing', %L, 2, 'Shelf check')$$,
  tests.variant_id('shop-a', 'WATER'), tests.unit_id('shop-a', 'pc')), 'A manager can write off stock');

-- ------------------------------------------------------------ business isolation
select tests.authenticate_as('bob@shop-b.test');
select is((select count(*)::int from public.stock_levels where business_id = tests.business_id('shop-a')), 0,
  'Business B cannot see Business A''s stock');
select is((select count(*)::int from public.stock_movements where business_id = tests.business_id('shop-a')), 0,
  'Business B cannot see Business A''s stock history');
select is((select count(*)::int from public.stock_overview(tests.business_id('shop-a'))), 0,
  'Business B gets an empty overview for Business A');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 5)$$,
  tests.variant_id('shop-a', 'MALT'), tests.unit_id('shop-a', 'pc')), '42501', null,
  'Business B cannot change Business A''s stock');
select throws_ok(format($$select public.record_stock_movement(%L, 'stock_in', %L, 5)$$,
  tests.variant_id('shop-b', 'COLA-50'), tests.unit_id('shop-a', 'pc')), '22023', null,
  'A unit from another business cannot be used');
select throws_ok(format($$select public.check_stock_records(%L)$$, tests.business_id('shop-a')), '42501', null,
  'Business B cannot check Business A''s records');
select throws_ok(format($$select public.start_stock_count(%L)$$, tests.business_id('shop-a')), '42501', null,
  'Business B cannot start a count in Business A');

-- ------------------------------------------------------------ stock counts
select tests.authenticate_as('cara@shop-a.test');
select throws_ok(format($$select public.start_stock_count(%L)$$, tests.business_id('shop-a')), '42501', null,
  'An attendant cannot start a stock count');
select tests.authenticate_as('ann@shop-a.test');
select public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'stock_in', tests.unit_id('shop-a', 'ctn'), 2);  -- 24
select throws_ok(format($$select public.start_stock_count(%L, %L)$$, tests.business_id('shop-a'),
  tests.section_id('shop-b', 'Beverages')), '22023', null, 'A count cannot use another business''s section');
select isnt(public.start_stock_count(tests.business_id('shop-a'), tests.section_id('shop-a', 'Beverages'), null, 'Monthly drinks'),
  null, 'The owner starts a count of the Beverages section');
select is((select array_agg(v.sku order by v.sku) from public.stock_count_lines l join public.product_variants v on v.id = l.variant_id
           where l.count_id = tests.latest_count_id('shop-a')), array['MALT', 'WATER'],
  'The count lists every active item in the section');
select is((select number from public.stock_counts where id = tests.latest_count_id('shop-a')), 1, 'Counts are numbered');
select throws_ok(format($$select public.start_stock_count(%L)$$, tests.business_id('shop-a')), '23505', null,
  'Only one count can be open at a time');

select tests.authenticate_as('cara@shop-a.test');
select lives_ok(format($$select public.record_count_line(%L, 20)$$,
  tests.count_line_id(tests.latest_count_id('shop-a'), 'MALT')), 'An attendant enters what is on the shelf');
select is((select system_quantity from public.stock_count_lines
           where id = tests.count_line_id(tests.latest_count_id('shop-a'), 'MALT')), 24::numeric,
  'The system quantity at the moment of counting is recorded');
select throws_ok(format($$select public.record_count_line(%L, -1)$$,
  tests.count_line_id(tests.latest_count_id('shop-a'), 'WATER')), '22023', null, 'A count cannot be below zero');
select throws_ok(format($$select public.record_count_line(%L, 2.5)$$,
  tests.count_line_id(tests.latest_count_id('shop-a'), 'WATER')), '22023', null,
  'Whole-number items need a whole count');
select throws_ok(format($$select public.post_stock_count(%L)$$, tests.latest_count_id('shop-a')), '42501', null,
  'An attendant cannot post a count');
select tests.authenticate_as('bob@shop-b.test');
select throws_ok(format($$select public.record_count_line(%L, 1)$$,
  tests.count_line_id(tests.latest_count_id('shop-a'), 'WATER')), '42501', null,
  'Business B cannot enter counts in Business A');

-- Two bottles leave after counting (e.g. sold); the count must not undo that.
select tests.authenticate_as('ann@shop-a.test');
select public.record_stock_movement(tests.variant_id('shop-a', 'MALT'), 'stock_out', tests.unit_id('shop-a', 'pc'), 2, 'Taken after counting');
select public.record_count_line(tests.count_line_id(tests.latest_count_id('shop-a'), 'WATER'), 22);  -- matches
select results_eq(format($$select public.post_stock_count(%L)$$, tests.latest_count_id('shop-a')),
  $$values ('{"counted": 2, "adjusted": 1}'::jsonb)$$, 'Posting adjusts only items that differ');
select is(tests.on_hand('shop-a', 'MALT'), 18::numeric,
  'Shortfall of 4 found by the count is applied; the 2 taken afterwards stay deducted (24 − 2 − 4)');
select results_eq(format($$select quantity, reason, stock_count_id = %L from public.stock_movements
                           where movement_type = 'count'$$, tests.latest_count_id('shop-a')),
  $$values (-4::numeric, 'Stock count 1', true)$$, 'The count difference is in the ledger, linked to the count');
select is((select status from public.stock_counts where id = tests.latest_count_id('shop-a')), 'posted',
  'The count is closed once posted');
select throws_ok(format($$select public.record_count_line(%L, 5)$$,
  tests.count_line_id(tests.latest_count_id('shop-a'), 'MALT')), '22023', null,
  'A posted count cannot be changed');
select throws_ok(format($$select public.post_stock_count(%L)$$, tests.latest_count_id('shop-a')), '22023', null,
  'A count cannot be posted twice');

select public.start_stock_count(tests.business_id('shop-a'));
select throws_ok(format($$select public.post_stock_count(%L)$$, tests.latest_count_id('shop-a')), '22023',
  'Count at least one item before posting', 'An empty count cannot be posted');
select lives_ok(format($$select public.cancel_stock_count(%L)$$, tests.latest_count_id('shop-a')),
  'An open count can be cancelled');
select is((select count(*)::int from public.stock_movements where stock_count_id = tests.latest_count_id('shop-a')), 0,
  'A cancelled count changes no stock');
select ok(exists (select 1 from public.audit_logs where entity_type = 'stock_counts'
                  and entity_id = tests.latest_count_id('shop-a')),
  'Starting and closing counts is in the audit log');

-- ------------------------------------------------------------ history
select results_eq(format($$select movement_type::text, quantity, created_by_name
                           from public.stock_movement_history(%L, %L) order by seq limit 2$$,
                         tests.business_id('shop-a'), tests.variant_id('shop-a', 'MALT')),
  $$values ('opening', 24::numeric, 'ann'), ('stock_in', 6::numeric, 'ann')$$,
  'History lists each movement with who made it');

-- ------------------------------------------------------------ reconciliation
select setseed(0.42);
do $$
declare
  v_items uuid[] := array[tests.variant_id('shop-a', 'MALT'), tests.variant_id('shop-a', 'WATER'),
                          tests.variant_id('shop-a', 'JAL-M')];
  i integer;
begin
  for i in 1..1000 loop
    perform public.record_stock_movement(
      v_items[1 + floor(random() * 3)::int],
      (array['stock_in', 'stock_out', 'damaged', 'missing'])[1 + floor(random() * 4)::int]::public.stock_movement_type,
      tests.unit_id('shop-a', 'pc'), (1 + floor(random() * 9))::numeric, 'random test', true);
  end loop;
end $$;
select is((select count(*)::int from public.stock_movements where reason = 'random test'), 1000,
  'The 1,000 random changes were all recorded');
select is(public.check_stock_records(tests.business_id('shop-a')) -> 'problems', '[]'::jsonb,
  'After 1,000 random changes every balance equals the sum of its movements and its last recorded balance');
select is((select count(*)::int from public.stock_movements m
           where m.business_id = tests.business_id('shop-a')
             and m.balance_before <> coalesce((select m2.balance_after from public.stock_movements m2
                                               where m2.variant_id = m.variant_id and m2.seq < m.seq
                                               order by m2.seq desc limit 1), 0)), 0,
  'Each movement starts from exactly where the previous one ended');
select is((public.check_stock_records(tests.business_id('shop-a')) ->> 'checked')::int, 5,
  'Reconciliation checks every item, archived ones included');

-- A tampered balance is detected.
reset role;
alter table public.stock_levels disable row level security;
update public.stock_levels set on_hand = on_hand + 1 where variant_id = tests.variant_id('shop-a', 'WATER');
alter table public.stock_levels enable row level security;
select tests.authenticate_as('ann@shop-a.test');
select is(jsonb_array_length(public.check_stock_records(tests.business_id('shop-a')) -> 'problems'), 1,
  'A balance that disagrees with its movements is reported');

select * from finish();
rollback;
