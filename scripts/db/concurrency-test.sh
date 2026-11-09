#!/usr/bin/env bash
# Concurrency test for the stock ledger (docs/13 §3.2 #5).
#
# 20 separate database sessions deduct 1 piece from the same item at the same
# instant. With correct locking the final stock is exactly 100 − 20 = 80, the
# ledger has 20 movements, and each one starts where the previous one ended.
#
# Usage: scripts/db/concurrency-test.sh "<psql connection options or URL>"
#   e.g. scripts/db/concurrency-test.sh postgresql://postgres:postgres@127.0.0.1:54322/postgres
set -euo pipefail

CONN=("$@")
PSQL=(psql "${CONN[@]}" -v ON_ERROR_STOP=1 -qtA)
WORKERS=20
RUN="conc-$(date +%s)-$$"
LOCK_KEY=742001

# --- setup: one business, one owner, one product with 100 pieces -------------
"${PSQL[@]}" <<SQL
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
values (gen_random_uuid(), '$RUN@test.local', '{"full_name":"Concurrency"}', now());
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = '$RUN@test.local'), 'role', 'authenticated')::text, false);
set role authenticated;
select public.create_business('Concurrency $RUN', '$RUN');
insert into public.sections (business_id, name)
select id, 'Drinks' from public.businesses where slug = '$RUN';
select public.create_product(b.id, jsonb_build_object(
  'section_id', s.id, 'name', 'Test drink', 'base_unit_id', u.id,
  'variants', jsonb_build_array(jsonb_build_object('sku', 'CONC-1'))))
from public.businesses b
join public.sections s on s.business_id = b.id
join public.units u on u.business_id = b.id and u.code = 'pc'
where b.slug = '$RUN';
select public.record_stock_movement(v.id, 'opening', u.id, 100)
from public.product_variants v
join public.businesses b on b.id = v.business_id and b.slug = '$RUN'
join public.units u on u.business_id = b.id and u.code = 'pc';
SQL

USER_ID=$("${PSQL[@]}" -c "select id from auth.users where email = '$RUN@test.local'")
VARIANT=$("${PSQL[@]}" -c "select v.id from public.product_variants v join public.businesses b on b.id = v.business_id where b.slug = '$RUN'")
UNIT=$("${PSQL[@]}" -c "select u.id from public.units u join public.businesses b on b.id = u.business_id where b.slug = '$RUN' and u.code = 'pc'")

# --- a gate: workers wait until all of them are connected ---------------------
"${PSQL[@]}" -c "select pg_advisory_lock($LOCK_KEY), pg_sleep(4)" >/dev/null &
GATE=$!
sleep 1

for i in $(seq 1 "$WORKERS"); do
  "${PSQL[@]}" >/dev/null <<SQL &
select pg_advisory_lock_shared($LOCK_KEY);
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$USER_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.record_stock_movement('$VARIANT', 'stock_out', '$UNIT', 1, 'concurrent worker $i');
commit;
SQL
done
wait

# --- check ---------------------------------------------------------------------
RESULT=$("${PSQL[@]}" <<SQL
select concat_ws(' ',
  (select on_hand from public.stock_levels where variant_id = '$VARIANT')::numeric::int,
  (select count(*) from public.stock_movements where variant_id = '$VARIANT' and movement_type = 'stock_out'),
  (select count(*) from public.stock_movements m
   where m.variant_id = '$VARIANT'
     and m.balance_before <> coalesce((select m2.balance_after from public.stock_movements m2
                                       where m2.variant_id = m.variant_id and m2.seq < m.seq
                                       order by m2.seq desc limit 1), 0)));
SQL
)
read -r ON_HAND MOVES BROKEN <<<"$RESULT"
echo "concurrency: final stock $ON_HAND (expected 80), deductions $MOVES (expected $WORKERS), broken links $BROKEN (expected 0)"
if [ "$ON_HAND" = "80" ] && [ "$MOVES" = "$WORKERS" ] && [ "$BROKEN" = "0" ]; then
  echo "concurrency: PASS"
else
  echo "concurrency: FAIL"
  exit 1
fi
