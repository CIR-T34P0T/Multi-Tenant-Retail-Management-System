-- Stage 6: products, variants, units, prices and costs —
-- rules, history, roles and business isolation.
begin;
\ir helpers.psql
select plan(51);

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
  'variants', jsonb_build_array(jsonb_build_object('sku', 'COLA-50',
    'prices', jsonb_build_array(jsonb_build_object('unit_id', tests.unit_id('shop-b', 'pc'), 'price', '300'))))));

-- ------------------------------------------------------------------ Business A
select tests.authenticate_as('ann@shop-a.test');
select public.create_business('Shop A', 'shop-a');
insert into public.business_members (business_id, user_id, role_id, status, joined_at)
select tests.business_id('shop-a'), tests.user_id(e), tests.role_id('shop-a', k), 'active', now()
from (values ('cara@shop-a.test', 'attendant'), ('dan@shop-a.test', 'manager')) as v(e, k);
insert into public.sections (business_id, name)
values (tests.business_id('shop-a'), 'Groceries'), (tests.business_id('shop-a'), 'Islamic Wear'),
       (tests.business_id('shop-a'), 'Beverages'), (tests.business_id('shop-a'), 'Old Stock');
insert into public.categories (business_id, section_id, name)
values (tests.business_id('shop-a'), tests.section_id('shop-a', 'Groceries'), 'Rice'),
       (tests.business_id('shop-a'), tests.section_id('shop-a', 'Islamic Wear'), 'Jalab');
update public.sections set status = 'archived' where id = tests.section_id('shop-a', 'Old Stock');

select is((select count(*)::int from public.units where business_id = tests.business_id('shop-a')), 12,
  'A new business starts with 12 common units');
select ok((select allows_decimal from public.units where id = tests.unit_id('shop-a', 'kg'))
          and not (select allows_decimal from public.units where id = tests.unit_id('shop-a', 'pc')),
  'Kilograms allow decimals; pieces are whole numbers');

-- Men's Jalab: options Size × Colour, priced per piece, with a cost.
select lives_ok(format('select public.create_product(%L, %L::jsonb)', tests.business_id('shop-a'),
  jsonb_build_object(
    'section_id', tests.section_id('shop-a', 'Islamic Wear'),
    'category_id', tests.category_id('shop-a', 'Islamic Wear', 'Jalab'),
    'name', 'Men''s Jalab', 'brand', '  Al Noor ', 'base_unit_id', tests.unit_id('shop-a', 'pc'),
    'option_names', jsonb_build_array(' Size ', 'Colour'),
    'variants', (select jsonb_agg(jsonb_build_object(
        'sku', 'JAL-' || s || '-' || c, 'option_values', jsonb_build_array(s, ' ' || c || ' '),
        'min_stock_level', '2', 'cost', '9000',
        'prices', jsonb_build_array(jsonb_build_object('unit_id', tests.unit_id('shop-a', 'pc'), 'price', '15000'))))
      from unnest(array['M', 'L']) s cross join unnest(array['White', 'Black']) c))),
  'Owner creates a product with 4 variants, prices and costs in one step');

select results_eq(
  format('select option_names, brand from public.products where id = %L', tests.product_id('shop-a', 'Men''s Jalab')),
  $$ values (array['Size', 'Colour'], 'Al Noor') $$, 'Option names and brand are tidied');
select results_eq(
  format('select count(*)::int, bool_and(option_values[2] in (''White'', ''Black'')) from public.product_variants where product_id = %L',
         tests.product_id('shop-a', 'Men''s Jalab')),
  $$ values (4, true) $$, 'All 4 variants exist with tidied option values');
select results_eq(
  format('select u.code, pu.factor::text, pu.is_base from public.product_units pu join public.units u on u.id = pu.unit_id where pu.product_id = %L',
         tests.product_id('shop-a', 'Men''s Jalab')),
  $$ values ('pc', '1.000000', true) $$, 'The base unit is added automatically with factor 1');
select is(
  (select price::text from public.variant_prices where variant_id = tests.variant_id('shop-a', 'JAL-L-White') and effective_to is null),
  '15000.00', 'Each variant has its current selling price');

-- ------------------------------------------------------------------ price history
select lives_ok(format('select public.set_variant_price(%L, %L, 16500)',
  tests.variant_id('shop-a', 'JAL-L-White'), tests.unit_id('shop-a', 'pc')), 'Owner changes a price');
select results_eq(
  format('select price::text, effective_to is null, set_by from public.variant_prices where variant_id = %L order by effective_from, effective_to nulls last',
         tests.variant_id('shop-a', 'JAL-L-White')),
  format($$ values ('15000.00', false, %1$L::uuid), ('16500.00', true, %1$L::uuid) $$, tests.user_id('ann@shop-a.test')),
  'The old price is kept, closed, and the new one is current — with who set them');
select public.set_variant_price(tests.variant_id('shop-a', 'JAL-L-White'), tests.unit_id('shop-a', 'pc'), 16500);
select is((select count(*)::int from public.variant_prices where variant_id = tests.variant_id('shop-a', 'JAL-L-White')), 2,
  'Saving the same price again adds no history entry');
select throws_ok(format('select public.set_variant_price(%L, %L, 99.999)',
  tests.variant_id('shop-a', 'JAL-L-White'), tests.unit_id('shop-a', 'pc')), '22023', null,
  'Prices with more than 2 decimal places are rejected');
select throws_ok(format('select public.set_variant_price(%L, %L, -1)',
  tests.variant_id('shop-a', 'JAL-L-White'), tests.unit_id('shop-a', 'pc')), '22023', null,
  'Negative prices are rejected');
select throws_ok(format('select public.set_variant_price(%L, %L, 100)',
  tests.variant_id('shop-a', 'JAL-L-White'), tests.unit_id('shop-a', 'kg')), '22023', null,
  'A price cannot be set in a unit the product does not use');
select throws_ok(format('insert into public.variant_prices (business_id, variant_id, unit_id, price) values (%L, %L, %L, 1)',
  tests.business_id('shop-a'), tests.variant_id('shop-a', 'JAL-L-White'), tests.unit_id('shop-a', 'pc')), '42501', null,
  'Prices cannot be inserted directly, only through set_variant_price()');
select throws_ok(format('update public.variant_prices set price = 1 where variant_id = %L',
  tests.variant_id('shop-a', 'JAL-L-White')), '42501', null, 'Price history cannot be edited');
select lives_ok(format('select public.set_variant_cost(%L, 9500.1234)', tests.variant_id('shop-a', 'JAL-L-White')),
  'Owner changes a cost price (4 decimal places allowed)');
select is((select count(*)::int from public.variant_costs where variant_id = tests.variant_id('shop-a', 'JAL-L-White')), 2,
  'Cost history keeps the old cost');

-- ------------------------------------------------------------------ units and cartons
select lives_ok(format('select public.create_product(%L, %L::jsonb)', tests.business_id('shop-a'),
  jsonb_build_object(
    'section_id', tests.section_id('shop-a', 'Beverages'), 'name', 'Malt 33cl',
    'base_unit_id', tests.unit_id('shop-a', 'pc'),
    'units', jsonb_build_array(jsonb_build_object('unit_id', tests.unit_id('shop-a', 'ctn'), 'factor', '24')),
    'variants', jsonb_build_array(jsonb_build_object('sku', 'MALT-33', 'barcode', '5012345678900',
      'prices', jsonb_build_array(
        jsonb_build_object('unit_id', tests.unit_id('shop-a', 'pc'), 'price', '450'),
        jsonb_build_object('unit_id', tests.unit_id('shop-a', 'ctn'), 'price', '10200')))))),
  'A product sold by the piece and by the carton of 24');
select is((select factor::text from public.product_units where product_id = tests.product_id('shop-a', 'Malt 33cl')
           and unit_id = tests.unit_id('shop-a', 'ctn')), '24.000000', 'The carton contains 24 pieces');
select throws_ok(format('insert into public.product_units (business_id, product_id, unit_id, factor) values (%L, %L, %L, 2.5)',
  tests.business_id('shop-a'), tests.product_id('shop-a', 'Malt 33cl'), tests.unit_id('shop-a', 'pack')), '22023', null,
  'A unit must contain a whole number of pieces when the base unit is pieces');
select throws_ok(format('update public.product_units set factor = 2 where product_id = %L and is_base',
  tests.product_id('shop-a', 'Malt 33cl')), '22023', null, 'The base unit''s factor cannot change');
select throws_ok(format('update public.products set base_unit_id = %L where id = %L',
  tests.unit_id('shop-a', 'ctn'), tests.product_id('shop-a', 'Malt 33cl')), '22023', null,
  'A product''s base unit cannot be changed');
select throws_ok(format('update public.units set code = %L where id = %L', 'cart', tests.unit_id('shop-a', 'ctn')),
  '22023', null, 'A unit''s symbol cannot change once products use it');

-- ------------------------------------------------------------------ validation
select throws_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-a', 'Men''s Jalab'),
  jsonb_build_object('sku', 'jal-m-white', 'option_values', jsonb_build_array('XL', 'White'))), '23505', null,
  'SKUs are unique in a business, ignoring capitals');
select throws_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-a', 'Men''s Jalab'),
  jsonb_build_object('sku', 'JAL-DUP', 'option_values', jsonb_build_array('M', 'White'))), '23505', null,
  'The same option combination cannot exist twice');
select throws_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-a', 'Men''s Jalab'),
  jsonb_build_object('sku', 'JAL-DUP2', 'option_values', jsonb_build_array(' m ', 'WHITE'))), '23505', null,
  'The same option combination is refused even with different capitals or spaces');
select throws_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-a', 'Men''s Jalab'),
  jsonb_build_object('sku', 'JAL-XL', 'option_values', jsonb_build_array('XL'))), '23514', null,
  'A variant needs a value for every option');
select throws_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-a', 'Malt 33cl'),
  jsonb_build_object('sku', 'MALT-B', 'barcode', '5012345678900')), '23505', null, 'Barcodes are unique in a business');
select throws_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-a', 'Malt 33cl'),
  jsonb_build_object('sku', 'MALT-C', 'min_stock_level', '2.5')), '23514', null,
  'Minimum stock must be a whole number for products counted in pieces');
select lives_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-a', 'Men''s Jalab'),
  jsonb_build_object('sku', 'JAL-XL-WHITE', 'option_values', jsonb_build_array('XL', 'White'))),
  'A new size can be added later');
select throws_ok(format('select public.create_product(%L, %L::jsonb)', tests.business_id('shop-a'),
  jsonb_build_object('section_id', tests.section_id('shop-a', 'Groceries'), 'name', 'Empty',
    'base_unit_id', tests.unit_id('shop-a', 'pc'), 'variants', '[]'::jsonb)), '23514', null,
  'A product needs at least one variant');
set constraints products_have_variant immediate;
select throws_ok(format('insert into public.products (business_id, section_id, name, base_unit_id) values (%L, %L, %L, %L)',
  tests.business_id('shop-a'), tests.section_id('shop-a', 'Groceries'), 'Bare', tests.unit_id('shop-a', 'pc')), '23514', null,
  'Even inserted directly, a product without variants is refused when saved');
set constraints products_have_variant deferred;
select throws_ok(format('update public.products set option_names = array[%L] where id = %L', 'Size',
  tests.product_id('shop-a', 'Men''s Jalab')), '22023', null, 'Options cannot be removed once variants exist');
select lives_ok(format('update public.products set option_names = array[%L, %L] where id = %L', 'Size', 'Color',
  tests.product_id('shop-a', 'Men''s Jalab')), 'Options can be renamed');
select throws_ok(format('select public.create_product(%L, %L::jsonb)', tests.business_id('shop-a'),
  jsonb_build_object('section_id', tests.section_id('shop-a', 'Old Stock'), 'name', 'Nope',
    'base_unit_id', tests.unit_id('shop-a', 'pc'), 'variants', jsonb_build_array(jsonb_build_object('sku', 'NOPE')))),
  '22023', null, 'No new products in an archived section');
select throws_ok(format('select public.create_product(%L, %L::jsonb)', tests.business_id('shop-a'),
  jsonb_build_object('section_id', tests.section_id('shop-a', 'Groceries'),
    'category_id', tests.category_id('shop-a', 'Islamic Wear', 'Jalab'), 'name', 'Mismatch',
    'base_unit_id', tests.unit_id('shop-a', 'pc'), 'variants', jsonb_build_array(jsonb_build_object('sku', 'MIS')))),
  '23503', null, 'A product''s category must belong to its section');
select throws_ok(format('delete from public.products where id = %L', tests.product_id('shop-a', 'Malt 33cl')),
  '42501', null, 'Products cannot be deleted, only archived');

-- Moving a category moves its products.
update public.categories set section_id = tests.section_id('shop-a', 'Groceries')
where id = tests.category_id('shop-a', 'Islamic Wear', 'Jalab');
select is((select section_id from public.products where id = tests.product_id('shop-a', 'Men''s Jalab')),
  tests.section_id('shop-a', 'Groceries'), 'Moving a category to another section moves its products too');
select ok(exists (select 1 from public.audit_logs where entity_type = 'products' and action = 'insert'),
  'Product creation is recorded in the audit log');

-- ------------------------------------------------------------------ roles inside A
select tests.authenticate_as('cara@shop-a.test');
select results_eq($$ select count(*)::int from public.products $$, $$ values (2) $$,
  'An attendant can see the products');
select isnt_empty($$ select * from public.variant_prices $$, 'An attendant can see selling prices');
select is_empty($$ select * from public.variant_costs $$, 'An attendant cannot see cost prices');
select throws_ok(format('select public.set_variant_price(%L, %L, 1)', tests.variant_id('shop-a', 'MALT-33'),
  tests.unit_id('shop-a', 'pc')), '42501', null, 'An attendant cannot change prices');
select is_empty(format('update public.products set name = %L where id = %L returning 1', 'Renamed',
  tests.product_id('shop-a', 'Malt 33cl')), 'An attendant cannot edit products');

select tests.authenticate_as('dan@shop-a.test');
select lives_ok(format('select public.set_variant_cost(%L, 300)', tests.variant_id('shop-a', 'MALT-33')),
  'A manager can set cost prices');

-- ------------------------------------------------------------------ isolation
select tests.authenticate_as('ann@shop-a.test');
select is_empty(format('select id from public.products where business_id = %L union all select id from public.product_variants where business_id = %L',
  tests.business_id('shop-b'), tests.business_id('shop-b')), 'Ann cannot see Business B products or variants');
select is_empty(format('select * from public.variant_prices where business_id = %L', tests.business_id('shop-b')),
  'Ann cannot see Business B prices');
select throws_ok(format('select public.set_variant_price(%L, %L, 1)', tests.variant_id('shop-b', 'COLA-50'),
  tests.unit_id('shop-b', 'pc')), '42501', null, 'Ann cannot change a Business B price, even with its exact IDs');
select throws_ok(format('select public.add_product_variant(%L, %L::jsonb)', tests.product_id('shop-b', 'Cola 50cl'),
  jsonb_build_object('sku', 'SPY')), '42501', null, 'Ann cannot add variants to a Business B product');
select throws_ok(format('select public.create_product(%L, %L::jsonb)', tests.business_id('shop-a'),
  jsonb_build_object('section_id', tests.section_id('shop-a', 'Groceries'), 'name', 'Cross',
    'base_unit_id', tests.unit_id('shop-b', 'pc'), 'variants', jsonb_build_array(jsonb_build_object('sku', 'CROSS')))),
  '23503', null, 'A product in A cannot use a unit belonging to B (composite foreign key)');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select price::text from public.variant_prices where variant_id = tests.variant_id('shop-b', 'COLA-50')),
  '300.00', 'Business B prices unchanged');

select * from finish();
rollback;
