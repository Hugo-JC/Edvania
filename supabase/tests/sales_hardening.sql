-- Transactional integration checks for the sale RPC.
-- Run against a disposable Supabase database. All fixture writes are rolled back.

begin;

do $test$
declare
  v_user uuid := gen_random_uuid();
  v_employee uuid := gen_random_uuid();
  v_store uuid;
  v_location uuid;
  v_product uuid;
  v_untracked uuid;
  v_key uuid := gen_random_uuid();
  v_untracked_key uuid := gen_random_uuid();
  v_sale uuid;
  v_replay uuid;
  v_count integer;
  v_balance numeric;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
  (
    v_user, 'authenticated', 'authenticated',
    'edvania-test-' || v_user::text || '@example.invalid', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    v_employee, 'authenticated', 'authenticated',
    'edvania-test-' || v_employee::text || '@example.invalid', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.stores (name, created_by)
  values ('TEST - rollback only', v_user)
  returning id into v_store;

  insert into public.store_memberships (store_id, user_id, role, status, joined_at)
  values
    (v_store, v_user, 'owner', 'active', now()),
    (v_store, v_employee, 'employee', 'active', now());

  insert into public.inventory_locations (store_id, name, is_default)
  values (v_store, 'Test location', true)
  returning id into v_location;

  insert into public.products (store_id, name, sale_price, cost_price, track_stock)
  values (v_store, 'Tracked test product', 100, 50, true)
  returning id into v_product;

  insert into public.products (store_id, name, sale_price, cost_price, track_stock)
  values (v_store, 'Untracked test product', 75, 0, false)
  returning id into v_untracked;

  insert into public.inventory_movements (
    store_id, product_id, location_id, movement_type, quantity_delta, created_by
  ) values (v_store, v_product, v_location, 'opening', 10, v_user);

  perform set_config('request.jwt.claim.sub', v_user::text, true);

  v_sale := public.create_sale_with_payment(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2)),
    'cash', 100, null, 'idempotency test', v_key
  );

  v_replay := public.create_sale_with_payment(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2)),
    'cash', 100, null, 'idempotency test', v_key
  );

  if v_sale is distinct from v_replay then
    raise exception 'TEST FAILED: idempotent replay returned a different sale';
  end if;

  select count(*) into v_count from public.sales
  where store_id = v_store and idempotency_key = v_key;
  if v_count <> 1 then raise exception 'TEST FAILED: duplicate sale created'; end if;

  select count(*) into v_count from public.payments
  where store_id = v_store and sale_id = v_sale;
  if v_count <> 1 then raise exception 'TEST FAILED: duplicate payment created'; end if;

  select count(*) into v_count from public.inventory_movements
  where store_id = v_store and product_id = v_product
    and reference_type = 'sale' and reference_id = v_sale;
  if v_count <> 1 then raise exception 'TEST FAILED: sale stock movement count is not one'; end if;

  select coalesce(sum(quantity_delta), 0) into v_balance
  from public.inventory_movements
  where store_id = v_store and product_id = v_product and location_id = v_location;
  if v_balance <> 8 then raise exception 'TEST FAILED: stock balance is incorrect'; end if;

  begin
    perform public.create_sale_with_payment(
      v_store,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
      'cash', 0, null, 'different payload', v_key
    );
    raise exception 'TEST FAILED: idempotency key reuse was accepted';
  exception when others then
    if sqlerrm not like '%idempotency_key_reused_with_different_payload%' then raise; end if;
  end;

  begin
    perform public.create_sale_with_payment(
      v_store,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 99)),
      'cash', 0, null, null, gen_random_uuid()
    );
    raise exception 'TEST FAILED: insufficient stock was accepted';
  exception when others then
    if sqlerrm not like '%insufficient_stock:%' then raise; end if;
  end;

  select count(*) into v_count from public.sales
  where store_id = v_store and idempotency_key is not null
    and request_fingerprint is not null;
  if v_count <> 1 then raise exception 'TEST FAILED: failed sale left a partial sales row'; end if;

  v_sale := public.create_sale_with_payment(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_untracked, 'quantity', 3)),
    'cash', 0, null, null, v_untracked_key
  );

  select count(*) into v_count from public.inventory_movements
  where store_id = v_store and product_id = v_untracked and reference_type = 'sale';
  if v_count <> 0 then raise exception 'TEST FAILED: untracked product created a stock movement'; end if;

  perform set_config('request.jwt.claim.sub', v_employee::text, true);
  begin
    perform public.create_sale_with_payment(
      v_store,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
      'cash', 0, null, null, gen_random_uuid()
    );
    raise exception 'TEST FAILED: employee role was allowed to create a sale';
  exception when others then
    if sqlerrm not like '%insufficient_store_role%' then raise; end if;
  end;

  if has_table_privilege('authenticated', 'public.payments', 'INSERT') then
    raise exception 'TEST FAILED: authenticated still has direct payment INSERT';
  end if;

  raise notice 'PASS: idempotency, payload mismatch, stock rollback, non-tracked products, role enforcement and payment grants';
end;
$test$;

rollback;
