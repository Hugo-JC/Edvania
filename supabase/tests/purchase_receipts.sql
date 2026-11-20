-- Transactional integration checks for purchase receipt.
-- Run against a disposable Supabase database. All fixture writes are rolled back.

begin;
do $test$
declare
  v_user uuid := gen_random_uuid();
  v_employee uuid := gen_random_uuid();
  v_store uuid;
  v_other_store uuid;
  v_location uuid;
  v_supplier uuid;
  v_product uuid;
  v_untracked uuid;
  v_other_product uuid;
  v_key uuid := gen_random_uuid();
  v_untracked_key uuid := gen_random_uuid();
  v_purchase uuid;
  v_replay uuid;
  v_count integer;
  v_balance numeric;
  v_total numeric;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
  (v_user, 'authenticated', 'authenticated', 'purchase-test-' || v_user::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (v_employee, 'authenticated', 'authenticated', 'purchase-test-' || v_employee::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.stores (name, created_by)
  values ('TEST PURCHASE - rollback only', v_user)
  returning id into v_store;

  insert into public.stores (name, created_by)
  values ('TEST PURCHASE OTHER STORE - rollback only', v_user)
  returning id into v_other_store;

  insert into public.store_memberships (store_id, user_id, role, status, joined_at)
  values
    (v_store, v_user, 'owner', 'active', now()),
    (v_store, v_employee, 'employee', 'active', now());

  insert into public.inventory_locations (store_id, name, is_default)
  values (v_store, 'Purchase test location', true)
  returning id into v_location;

  insert into public.suppliers (store_id, name, status)
  values (v_store, 'Test supplier', 'active')
  returning id into v_supplier;

  insert into public.products (store_id, name, sale_price, cost_price, track_stock)
  values (v_store, 'Purchased tracked item', 100, 0, true)
  returning id into v_product;

  insert into public.products (store_id, name, sale_price, cost_price, track_stock)
  values (v_store, 'Purchased untracked item', 50, 0, false)
  returning id into v_untracked;

  insert into public.products (store_id, name, sale_price, cost_price, track_stock)
  values (v_other_store, 'Other store purchased item', 50, 0, true)
  returning id into v_other_product;

  perform set_config('request.jwt.claim.sub', v_user::text, true);

  v_purchase := public.create_purchase_with_receipt(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3, 'unit_cost', 50)),
    v_supplier, 'INV-TEST-01', 'purchase idempotency test', v_key
  );

  v_replay := public.create_purchase_with_receipt(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3, 'unit_cost', 50)),
    v_supplier, 'INV-TEST-01', 'purchase idempotency test', v_key
  );

  if v_purchase is distinct from v_replay then raise exception 'TEST FAILED: purchase idempotency replay mismatch'; end if;

  select count(*) into v_count from public.purchases where store_id=v_store and idempotency_key=v_key;
  if v_count <> 1 then raise exception 'TEST FAILED: duplicate purchase created'; end if;

  select count(*) into v_count from public.purchase_items where store_id=v_store and purchase_id=v_purchase;
  if v_count <> 1 then raise exception 'TEST FAILED: purchase item count mismatch'; end if;

  select count(*) into v_count from public.inventory_movements
  where store_id=v_store and product_id=v_product and reference_type='purchase' and reference_id=v_purchase;
  if v_count <> 1 then raise exception 'TEST FAILED: purchase receipt movement count mismatch'; end if;

  select coalesce(sum(quantity_delta),0) into v_balance
  from public.inventory_movements
  where store_id=v_store and product_id=v_product and location_id=v_location;
  if v_balance <> 3 then raise exception 'TEST FAILED: purchase stock balance mismatch'; end if;

  select total into v_total from public.purchases where id=v_purchase and store_id=v_store;
  if v_total <> 150 then raise exception 'TEST FAILED: purchase total mismatch'; end if;

  begin
    perform public.create_purchase_with_receipt(
      v_store,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 4, 'unit_cost', 50)),
      v_supplier, 'INV-TEST-01', 'different payload', v_key
    );
    raise exception 'TEST FAILED: purchase idempotency key reuse was accepted';
  exception when others then
    if sqlerrm not like '%idempotency_key_reused_with_different_payload%' then raise; end if;
  end;

  v_purchase := public.create_purchase_with_receipt(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_untracked, 'quantity', 2, 'unit_cost', 10)),
    v_supplier, null, null, v_untracked_key
  );

  select count(*) into v_count from public.inventory_movements
  where store_id=v_store and product_id=v_untracked and reference_type='purchase';
  if v_count <> 0 then raise exception 'TEST FAILED: untracked product generated stock movement'; end if;

  begin
    perform public.create_purchase_with_receipt(
      v_store,
      jsonb_build_array(jsonb_build_object('product_id', gen_random_uuid(), 'quantity', 1, 'unit_cost', 10)),
      v_supplier, null, null, gen_random_uuid()
    );
    raise exception 'TEST FAILED: invalid product purchase was accepted';
  exception when others then
    if sqlerrm not like '%product_not_found%' then raise; end if;
  end;

  select count(*) into v_count from public.purchases where store_id=v_store;
  if v_count <> 2 then raise exception 'TEST FAILED: failed purchase left a partial header'; end if;

  begin
    perform public.create_purchase_with_receipt(
      v_store,
      jsonb_build_array(jsonb_build_object('product_id', v_other_product, 'quantity', 1, 'unit_cost', 10)),
      v_supplier, null, null, gen_random_uuid()
    );
    raise exception 'TEST FAILED: cross-store product was accepted';
  exception when others then
    if sqlerrm not like '%product_not_found%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_employee::text, true);
  begin
    perform public.create_purchase_with_receipt(
      v_store,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_cost', 1)),
      v_supplier, null, null, gen_random_uuid()
    );
    raise exception 'TEST FAILED: employee role was allowed to receive a purchase';
  exception when others then
    if sqlerrm not like '%insufficient_store_role%' then raise; end if;
  end;

  if has_table_privilege('authenticated','public.purchases','INSERT')
     or has_table_privilege('authenticated','public.purchases','UPDATE')
     or has_table_privilege('authenticated','public.purchases','DELETE') then
    raise exception 'TEST FAILED: direct purchase writes remain available';
  end if;
  if has_table_privilege('authenticated','public.purchase_items','INSERT')
     or has_table_privilege('authenticated','public.purchase_items','UPDATE')
     or has_table_privilege('authenticated','public.purchase_items','DELETE') then
    raise exception 'TEST FAILED: direct purchase item writes remain available';
  end if;

  raise notice 'PASS: atomic purchase receipt, stock ledger, idempotency, rollback, non-tracked product and role enforcement';
end;
$test$;
rollback;
