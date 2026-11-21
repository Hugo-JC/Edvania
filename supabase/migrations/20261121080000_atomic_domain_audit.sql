create function public.write_operation_audit_log(
  p_store_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_request_id text,
  p_metadata jsonb,
  p_idempotency_key uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit_id bigint;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_access(p_store_id) then raise exception 'store_access_denied'; end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_store_id::text || ':' || p_action || ':' || p_idempotency_key::text, 0
  ));

  select id into v_audit_id
  from public.audit_logs
  where store_id = p_store_id
    and action = p_action
    and entity_type = p_entity_type
    and entity_id = p_entity_id
    and metadata ->> 'idempotency_key' = p_idempotency_key::text
  order by id
  limit 1;

  if found then return v_audit_id; end if;

  return public.write_audit_log(
    p_store_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_request_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('idempotency_key', p_idempotency_key::text)
  );
end;
$$;

revoke all on function public.write_operation_audit_log(uuid,text,text,uuid,text,jsonb,uuid) from public, anon;
grant execute on function public.write_operation_audit_log(uuid,text,text,uuid,text,jsonb,uuid) to authenticated;

create or replace function public.write_audit_log(
  p_store_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_request_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id bigint;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_access(p_store_id) then raise exception 'store_access_denied'; end if;
  if p_action not in (
    'sale.created', 'purchase.received', 'cash_session.opened', 'cash_session.closed',
    'cash_movement.recorded', 'expense.registered', 'product.created', 'category.created',
    'customer.created', 'supplier.created', 'inventory.entry'
  ) then raise exception 'invalid_audit_action'; end if;
  if p_entity_type not in (
    'sale', 'purchase', 'cash_session', 'cash_movement', 'expense', 'product',
    'category', 'customer', 'supplier', 'inventory_movement'
  ) then raise exception 'invalid_audit_entity'; end if;
  if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata) <> 'object'
     or pg_catalog.octet_length(p_metadata::text) > 4096 then
    raise exception 'invalid_audit_metadata';
  end if;
  if p_request_id is not null and pg_catalog.char_length(p_request_id) > 120 then
    raise exception 'invalid_audit_request_id';
  end if;

  insert into public.audit_logs(store_id, actor_user_id, action, entity_type, entity_id, request_id, metadata)
  values (p_store_id, v_user_id, p_action, p_entity_type, p_entity_id, p_request_id, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.create_sale_with_audit(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_paid_amount numeric default 0,
  p_customer_id uuid default null,
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.create_sale_with_payment(
    p_store_id, p_items, p_payment_method, p_paid_amount,
    p_customer_id, p_notes, p_idempotency_key
  );
  perform public.write_operation_audit_log(
    p_store_id, 'sale.created', 'sale', v_id, p_request_id,
    jsonb_build_object('item_count', jsonb_array_length(p_items)), p_idempotency_key
  );
  return v_id;
end;
$$;

create function public.record_cash_movement_with_audit(
  p_store_id uuid,
  p_session_id uuid,
  p_movement_type text,
  p_direction text,
  p_amount numeric,
  p_description text,
  p_idempotency_key uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.record_cash_movement(
    p_store_id, p_session_id, p_movement_type, p_direction, p_amount, p_description, p_idempotency_key
  );
  perform public.write_operation_audit_log(
    p_store_id, 'cash_movement.recorded', 'cash_movement', v_id, p_request_id,
    jsonb_build_object('amount', p_amount, 'direction', p_direction, 'movement_type', p_movement_type),
    p_idempotency_key
  );
  return v_id;
end;
$$;

create function public.create_purchase_with_audit(
  p_store_id uuid,
  p_items jsonb,
  p_supplier_id uuid default null,
  p_supplier_reference text default null,
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.create_purchase_with_receipt(
    p_store_id, p_items, p_supplier_id, p_supplier_reference, p_notes, p_idempotency_key
  );
  perform public.write_operation_audit_log(
    p_store_id, 'purchase.received', 'purchase', v_id, p_request_id,
    jsonb_build_object('item_count', jsonb_array_length(p_items)), p_idempotency_key
  );
  return v_id;
end;
$$;

create function public.open_cash_session_with_audit(
  p_store_id uuid,
  p_register_id uuid,
  p_opening_amount numeric,
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.open_cash_session(p_store_id, p_register_id, p_opening_amount, p_notes, p_idempotency_key);
  perform public.write_operation_audit_log(
    p_store_id, 'cash_session.opened', 'cash_session', v_id, p_request_id, '{}'::jsonb, p_idempotency_key
  );
  return v_id;
end;
$$;

create function public.close_cash_session_with_audit(
  p_store_id uuid,
  p_session_id uuid,
  p_counted_amount numeric,
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.close_cash_session(p_store_id, p_session_id, p_counted_amount, p_notes, p_idempotency_key);
  perform public.write_operation_audit_log(
    p_store_id, 'cash_session.closed', 'cash_session', v_id, p_request_id, '{}'::jsonb, p_idempotency_key
  );
  return v_id;
end;
$$;

create function public.record_cash_expense_with_audit(
  p_store_id uuid,
  p_session_id uuid,
  p_description text,
  p_category text,
  p_amount numeric,
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.record_cash_expense(
    p_store_id, p_session_id, p_description, p_category, p_amount, p_notes, p_idempotency_key
  );
  perform public.write_operation_audit_log(
    p_store_id, 'expense.registered', 'expense', v_id, p_request_id,
    jsonb_build_object('amount', p_amount), p_idempotency_key
  );
  return v_id;
end;
$$;

create function public.create_product_with_audit(
  p_store_id uuid,
  p_name text,
  p_sale_price numeric,
  p_cost_price numeric default 0,
  p_sku text default null,
  p_category_id uuid default null,
  p_min_stock numeric default 0,
  p_opening_quantity numeric default 0,
  p_unit text default 'un',
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.create_product_with_opening_stock(
    p_store_id, p_name, p_sale_price, p_cost_price, p_sku,
    p_category_id, p_min_stock, p_opening_quantity, p_unit
  );
  perform public.write_audit_log(p_store_id, 'product.created', 'product', v_id, p_request_id, '{}'::jsonb);
  return v_id;
end;
$$;

create function public.create_category_with_audit(
  p_store_id uuid,
  p_name text,
  p_description text default null,
  p_parent_id uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.categories (store_id, name, description, parent_id)
  values (p_store_id, p_name, p_description, p_parent_id)
  returning id into v_id;
  perform public.write_audit_log(p_store_id, 'category.created', 'category', v_id, p_request_id, '{}'::jsonb);
  return v_id;
end;
$$;

create function public.create_customer_with_audit(
  p_store_id uuid,
  p_name text,
  p_phone_e164 text default null,
  p_email text default null,
  p_tax_number text default null,
  p_address text default null,
  p_notes text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.customers (store_id, name, phone_e164, email, tax_number, address, notes)
  values (p_store_id, p_name, p_phone_e164, p_email, p_tax_number, p_address, p_notes)
  returning id into v_id;
  perform public.write_audit_log(p_store_id, 'customer.created', 'customer', v_id, p_request_id, '{}'::jsonb);
  return v_id;
end;
$$;

create function public.create_supplier_with_audit(
  p_store_id uuid,
  p_name text,
  p_phone_e164 text default null,
  p_email text default null,
  p_tax_number text default null,
  p_address text default null,
  p_notes text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.suppliers (store_id, name, phone_e164, email, tax_number, address, notes)
  values (p_store_id, p_name, p_phone_e164, p_email, p_tax_number, p_address, p_notes)
  returning id into v_id;
  perform public.write_audit_log(p_store_id, 'supplier.created', 'supplier', v_id, p_request_id, '{}'::jsonb);
  return v_id;
end;
$$;

create function public.record_stock_entry_with_audit(
  p_store_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_movement_type public.stock_movement_type,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_notes text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.inventory_movements (
    store_id, product_id, location_id, movement_type, quantity_delta, unit_cost, notes, created_by
  ) values (
    p_store_id, p_product_id, p_location_id, p_movement_type, p_quantity, p_unit_cost, p_notes, (select auth.uid())
  )
  returning id into v_id;
  perform public.write_audit_log(
    p_store_id, 'inventory.entry', 'inventory_movement', v_id, p_request_id,
    jsonb_build_object('quantity', p_quantity, 'movement_type', p_movement_type::text)
  );
  return v_id;
end;
$$;

revoke all on function public.create_sale_with_audit(uuid,jsonb,public.payment_method,numeric,uuid,text,uuid,text) from public, anon;
revoke all on function public.record_cash_movement_with_audit(uuid,uuid,text,text,numeric,text,uuid,text) from public, anon;
revoke all on function public.create_purchase_with_audit(uuid,jsonb,uuid,text,text,uuid,text) from public, anon;
revoke all on function public.open_cash_session_with_audit(uuid,uuid,numeric,text,uuid,text) from public, anon;
revoke all on function public.close_cash_session_with_audit(uuid,uuid,numeric,text,uuid,text) from public, anon;
revoke all on function public.record_cash_expense_with_audit(uuid,uuid,text,text,numeric,text,uuid,text) from public, anon;
revoke all on function public.create_product_with_audit(uuid,text,numeric,numeric,text,uuid,numeric,numeric,text,text) from public, anon;
revoke all on function public.create_category_with_audit(uuid,text,text,uuid,text) from public, anon;
revoke all on function public.create_customer_with_audit(uuid,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.create_supplier_with_audit(uuid,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.record_stock_entry_with_audit(uuid,uuid,uuid,public.stock_movement_type,numeric,numeric,text,text) from public, anon;

grant execute on function public.create_sale_with_audit(uuid,jsonb,public.payment_method,numeric,uuid,text,uuid,text) to authenticated;
grant execute on function public.record_cash_movement_with_audit(uuid,uuid,text,text,numeric,text,uuid,text) to authenticated;
grant execute on function public.create_purchase_with_audit(uuid,jsonb,uuid,text,text,uuid,text) to authenticated;
grant execute on function public.open_cash_session_with_audit(uuid,uuid,numeric,text,uuid,text) to authenticated;
grant execute on function public.close_cash_session_with_audit(uuid,uuid,numeric,text,uuid,text) to authenticated;
grant execute on function public.record_cash_expense_with_audit(uuid,uuid,text,text,numeric,text,uuid,text) to authenticated;
grant execute on function public.create_product_with_audit(uuid,text,numeric,numeric,text,uuid,numeric,numeric,text,text) to authenticated;
grant execute on function public.create_category_with_audit(uuid,text,text,uuid,text) to authenticated;
grant execute on function public.create_customer_with_audit(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_supplier_with_audit(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.record_stock_entry_with_audit(uuid,uuid,uuid,public.stock_movement_type,numeric,numeric,text,text) to authenticated;
