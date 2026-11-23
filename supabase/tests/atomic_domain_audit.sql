-- Transactional integration checks for atomic domain + audit RPC wrappers (Meta B / Meta 3).
-- Run against a disposable Supabase database. All fixture writes are rolled back.

begin;

do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_store uuid;
  v_product uuid;
  v_category uuid;
  v_customer uuid;
  v_supplier uuid;
  v_sale uuid;
  v_sale_replay uuid;
  v_purchase uuid;
  v_purchase_replay uuid;
  v_sale_key uuid := gen_random_uuid();
  v_purchase_key uuid := gen_random_uuid();
  v_audit_count integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
  (v_owner, 'authenticated', 'authenticated', 'audit-owner-' || v_owner || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (v_other, 'authenticated', 'authenticated', 'audit-other-' || v_other || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.stores (name, created_by)
  values ('TEST ATOMIC AUDIT - rollback only', v_owner)
  returning id into v_store;

  insert into public.store_memberships (store_id, user_id, role, status, joined_at)
  values (v_store, v_owner, 'owner', 'active', now());

  insert into public.inventory_locations (store_id, name, is_default)
  values (v_store, 'Principal', true);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  v_category := public.create_category_with_audit(v_store, 'Mercearia', null, null, 'req-cat-1');
  if v_category is null then raise exception 'TEST FAILED: create_category_with_audit returned null'; end if;

  v_product := public.create_product_with_audit(v_store, 'Arroz Teste 1kg', 1200, 900, 'SKU-ARZ', v_category, 2, 10, 'un', 'req-prod-1');
  if v_product is null then raise exception 'TEST FAILED: create_product_with_audit returned null'; end if;

  v_customer := public.create_customer_with_audit(v_store, 'Cliente Audit', '+244923000001', null, null, null, null, 'req-cust-1');
  v_supplier := public.create_supplier_with_audit(v_store, 'Fornecedor Audit', '+244923000002', null, null, null, null, 'req-sup-1');
  if v_customer is null or v_supplier is null then
    raise exception 'TEST FAILED: customer/supplier with audit failed';
  end if;

  v_purchase := public.create_purchase_with_audit(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 5, 'unit_cost', 850)),
    v_supplier,
    'FAC-001',
    'Entrada inicial',
    v_purchase_key,
    'req-purch-1'
  );
  v_purchase_replay := public.create_purchase_with_audit(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 5, 'unit_cost', 850)),
    v_supplier,
    'FAC-001',
    'Entrada inicial',
    v_purchase_key,
    'req-purch-2'
  );
  if v_purchase is distinct from v_purchase_replay then
    raise exception 'TEST FAILED: purchase replay mismatch';
  end if;
  select count(*) into v_audit_count from public.audit_logs
  where store_id = v_store and action = 'purchase.created' and entity_id = v_purchase;
  if v_audit_count <> 1 then
    raise exception 'TEST FAILED: purchase replay generated % audit logs', v_audit_count;
  end if;

  v_sale := public.create_sale_with_audit(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2)),
    'cash',
    2400,
    v_customer,
    'Venda teste',
    v_sale_key,
    'req-sale-1'
  );
  v_sale_replay := public.create_sale_with_audit(
    v_store,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2)),
    'cash',
    2400,
    v_customer,
    'Venda teste',
    v_sale_key,
    'req-sale-2'
  );
  if v_sale is distinct from v_sale_replay then
    raise exception 'TEST FAILED: sale replay mismatch';
  end if;
  select count(*) into v_audit_count from public.audit_logs
  where store_id = v_store and action = 'sale.created' and entity_id = v_sale;
  if v_audit_count <> 1 then
    raise exception 'TEST FAILED: sale replay generated % audit logs', v_audit_count;
  end if;

  -- Unauthorized user must be denied
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  begin
    perform public.create_product_with_audit(v_store, 'Produto Invasor', 100, 50, null, null, 0, 0, 'un', 'req-bad');
    raise exception 'TEST FAILED: outsider created product';
  exception when others then
    if sqlerrm not like '%store_access_denied%' then raise; end if;
  end;
end;
$test$;

rollback;
