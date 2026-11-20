create or replace function public.create_store_for_current_user(p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_store_id uuid;
  v_name text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid_store_name';
  end if;

  insert into public.stores (name, created_by)
  values (v_name, v_user_id)
  returning id into v_store_id;

  insert into public.store_memberships (store_id, user_id, role, status, joined_at)
  values (v_store_id, v_user_id, 'owner', 'active', now());

  insert into public.inventory_locations (store_id, name, is_default)
  values (v_store_id, 'Armazém principal', true);

  return v_store_id;
end;
$$;

revoke all on function public.create_store_for_current_user(text) from public, anon;
grant execute on function public.create_store_for_current_user(text) to authenticated;

create policy inventory_movements_insert_stock_in
on public.inventory_movements
for insert
to authenticated
with check (
  public.has_store_role(
    store_id,
    array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]
  )
  and created_by = (select auth.uid())
  and movement_type in (
    'opening'::public.stock_movement_type,
    'purchase'::public.stock_movement_type,
    'return_in'::public.stock_movement_type
  )
  and quantity_delta > 0
);

create or replace function public.create_product_with_opening_stock(
  p_store_id uuid,
  p_name text,
  p_sale_price numeric,
  p_cost_price numeric default 0,
  p_sku text default null,
  p_category_id uuid default null,
  p_min_stock numeric default 0,
  p_opening_quantity numeric default 0,
  p_unit text default 'un'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_product_id uuid;
  v_location_id uuid;
  v_name text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_store_role(
    p_store_id,
    array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]
  ) then
    raise exception 'insufficient_store_role';
  end if;

  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 180 then
    raise exception 'invalid_product_name';
  end if;

  if p_sale_price < 0 or p_cost_price < 0 or p_min_stock < 0 or p_opening_quantity < 0 then
    raise exception 'invalid_product_amount';
  end if;

  if p_unit is null or char_length(btrim(p_unit)) < 1 or char_length(p_unit) > 24 then
    raise exception 'invalid_product_unit';
  end if;

  insert into public.products (
    store_id, name, sale_price, cost_price, sku, category_id, min_stock, unit
  ) values (
    p_store_id, v_name, p_sale_price, p_cost_price,
    nullif(btrim(coalesce(p_sku, '')), ''), p_category_id, p_min_stock, btrim(p_unit)
  )
  returning id into v_product_id;

  if p_opening_quantity > 0 then
    select id into v_location_id
    from public.inventory_locations
    where store_id = p_store_id and is_default = true and status = 'active'
    limit 1;

    if v_location_id is null then
      raise exception 'default_inventory_location_missing';
    end if;

    insert into public.inventory_movements (
      store_id, product_id, location_id, movement_type,
      quantity_delta, unit_cost, notes, created_by
    ) values (
      p_store_id, v_product_id, v_location_id, 'opening',
      p_opening_quantity, p_cost_price, 'Stock inicial do produto', v_user_id
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.create_product_with_opening_stock(uuid,text,numeric,numeric,text,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.create_product_with_opening_stock(uuid,text,numeric,numeric,text,uuid,numeric,numeric,text) to authenticated;
