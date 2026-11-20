create policy payments_insert_store_member
on public.payments
for insert to authenticated
with check (public.has_store_access(store_id));

create policy inventory_movements_insert_sale_out
on public.inventory_movements
for insert to authenticated
with check (
  public.has_store_access(store_id)
  and created_by = (select auth.uid())
  and movement_type = 'sale'::public.stock_movement_type
  and quantity_delta < 0
  and reference_type = 'sale'
);

create or replace function public.create_sale_with_payment(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_paid_amount numeric default 0,
  p_customer_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sale_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_sku text;
  v_unit_price numeric(14,2);
  v_quantity numeric(14,3);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_stock numeric(14,3);
  v_location_id uuid;
  v_item jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_access(p_store_id) then raise exception 'store_access_denied'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'invalid_sale_items';
  end if;
  if p_paid_amount is null or p_paid_amount < 0 then raise exception 'invalid_paid_amount'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers c where c.id = p_customer_id and c.store_id = p_store_id) then
    raise exception 'customer_not_found';
  end if;

  insert into public.sales (store_id, customer_id, status, notes, created_by)
  values (p_store_id, p_customer_id, 'draft'::public.sale_status, nullif(btrim(coalesce(p_notes, '')), ''), v_user_id)
  returning id into v_sale_id;

  select il.id into v_location_id from public.inventory_locations il
  where il.store_id = p_store_id and il.is_default = true and il.status = 'active'::public.record_status limit 1;
  if v_location_id is null then raise exception 'default_inventory_location_missing'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' or coalesce(v_item->>'product_id', '') = '' or coalesce(v_item->>'quantity', '') = '' then
      raise exception 'invalid_sale_item';
    end if;
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
    exception when others then raise exception 'invalid_sale_item'; end;
    if v_quantity <= 0 or v_quantity <> round(v_quantity, 3) then raise exception 'invalid_sale_quantity'; end if;

    select p.name, p.sku, p.sale_price into v_product_name, v_sku, v_unit_price
    from public.products p
    where p.id = v_product_id and p.store_id = p_store_id and p.status = 'active'::public.record_status
    for update;
    if not found then raise exception 'product_not_found'; end if;

    select coalesce(sum(im.quantity_delta), 0) into v_stock
    from public.inventory_movements im where im.store_id = p_store_id and im.product_id = v_product_id;
    if v_stock < v_quantity then raise exception 'insufficient_stock:%', v_product_name; end if;

    v_line_total := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.sale_items (store_id, sale_id, product_id, product_name, sku, quantity, unit_price, discount_amount, tax_rate, line_total)
    values (p_store_id, v_sale_id, v_product_id, v_product_name, v_sku, v_quantity, v_unit_price, 0, 0, v_line_total);

    insert into public.inventory_movements (store_id, product_id, location_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_by)
    values (p_store_id, v_product_id, v_location_id, 'sale'::public.stock_movement_type, -v_quantity, 'sale', v_sale_id, 'Saída por venda', v_user_id);
  end loop;

  v_total := round(v_subtotal, 2);
  if p_paid_amount > v_total then raise exception 'paid_amount_exceeds_sale_total'; end if;

  update public.sales set subtotal = v_total, total = v_total, status = 'confirmed'::public.sale_status, sold_at = now(), updated_at = now()
  where id = v_sale_id and store_id = p_store_id;

  if p_paid_amount > 0 then
    insert into public.payments (store_id, sale_id, method, status, amount, currency_code, paid_at)
    values (p_store_id, v_sale_id, p_payment_method, 'confirmed'::public.payment_status, p_paid_amount, 'AOA', now());
  end if;
  return v_sale_id;
end;
$$;

revoke all on function public.create_sale_with_payment(uuid, jsonb, public.payment_method, numeric, uuid, text) from public, anon;
grant execute on function public.create_sale_with_payment(uuid, jsonb, public.payment_method, numeric, uuid, text) to authenticated;
