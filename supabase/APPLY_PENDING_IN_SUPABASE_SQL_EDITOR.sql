-- Edvânia: Script consolidado e idempotente de TODAS as migrações pendentes após o snapshot base 20261119165840
-- Inclui: 20261119180415 -> 20261120120000 -> 20261121080000 -> 20261121100000 -> 20261122090000 -> 20261123080000
-- Podes colar e executar este ficheiro inteiro uma vez no SQL Editor do Supabase Dashboard (Run).

-- ============================================================================
-- PARTE 1: Criação de loja, armazém padrão e stock inicial (20261119180415 + 20261120084529)
-- ============================================================================

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
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid_store_name';
  end if;
  insert into public.stores (name, created_by) values (v_name, v_user_id) returning id into v_store_id;
  insert into public.store_memberships (store_id, user_id, role, status, joined_at)
  values (v_store_id, v_user_id, 'owner', 'active', now());
  insert into public.inventory_locations (store_id, name, is_default)
  values (v_store_id, 'Armazém principal', true);
  return v_store_id;
end;
$$;

revoke all on function public.create_store_for_current_user(text) from public, anon;
grant execute on function public.create_store_for_current_user(text) to authenticated;

create or replace function public.create_product_with_opening_stock(
  p_store_id uuid, p_name text, p_sale_price numeric,
  p_cost_price numeric default 0, p_sku text default null,
  p_category_id uuid default null, p_min_stock numeric default 0,
  p_opening_quantity numeric default 0, p_unit text default 'un'
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
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_role(p_store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]) then
    raise exception 'insufficient_store_role';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 180 then raise exception 'invalid_product_name'; end if;
  if p_sale_price < 0 or p_cost_price < 0 or p_min_stock < 0 or p_opening_quantity < 0 then raise exception 'invalid_product_amount'; end if;
  if p_unit is null or char_length(btrim(p_unit)) < 1 or char_length(p_unit) > 24 then raise exception 'invalid_product_unit'; end if;

  insert into public.products (store_id, name, sale_price, cost_price, sku, category_id, min_stock, unit)
  values (p_store_id, v_name, p_sale_price, p_cost_price, nullif(btrim(coalesce(p_sku, '')), ''), p_category_id, p_min_stock, btrim(p_unit))
  returning id into v_product_id;

  if p_opening_quantity > 0 then
    select id into v_location_id from public.inventory_locations
    where store_id = p_store_id and is_default = true and status = 'active' limit 1;
    if v_location_id is null then raise exception 'default_inventory_location_missing'; end if;
    insert into public.inventory_movements (store_id, product_id, location_id, movement_type, quantity_delta, unit_cost, notes, created_by)
    values (p_store_id, v_product_id, v_location_id, 'opening', p_opening_quantity, p_cost_price, 'Stock inicial do produto', v_user_id);
  end if;
  return v_product_id;
end;
$$;

revoke all on function public.create_product_with_opening_stock(uuid,text,numeric,numeric,text,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.create_product_with_opening_stock(uuid,text,numeric,numeric,text,uuid,numeric,numeric,text) to authenticated;

-- ============================================================================
-- PARTE 2: Vendas e pagamentos atómicos + isolamento em schema privado (20261120092205 -> 20261120093457)
-- ============================================================================

alter table public.sales
  add column if not exists idempotency_key uuid,
  add column if not exists request_fingerprint text;

create unique index if not exists sales_store_idempotency_key_uidx
  on public.sales (store_id, idempotency_key)
  where idempotency_key is not null;

drop policy if exists payments_insert_store_member on public.payments;
drop policy if exists payments_insert_commercial_manager on public.payments;
drop policy if exists inventory_movements_insert_sale_out on public.inventory_movements;
drop policy if exists sales_insert_member on public.sales;
drop policy if exists sales_update_manager on public.sales;
drop policy if exists sales_delete_admin on public.sales;
drop policy if exists sale_items_insert_member on public.sale_items;
drop policy if exists sale_items_update_manager on public.sale_items;
drop policy if exists sale_items_delete_manager on public.sale_items;

revoke insert, update, delete on table public.payments from anon, authenticated;
revoke insert, update, delete on table public.sales from anon, authenticated;
revoke insert, update, delete on table public.sale_items from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

drop function if exists public.create_sale_with_payment(uuid, jsonb, public.payment_method, numeric, uuid, text);

create or replace function private.create_sale_with_payment_internal(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_paid_amount numeric default 0,
  p_customer_id uuid default null,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sale_id uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_normalized_items jsonb;
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
  v_track_stock boolean;
  v_location_loaded boolean := false;
  v_item jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_role(p_store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]) then
    raise exception 'insufficient_store_role';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'invalid_sale_items'; end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then raise exception 'invalid_sale_items'; end if;
  if p_paid_amount is null or p_paid_amount < 0 or p_paid_amount <> round(p_paid_amount, 2) then raise exception 'invalid_paid_amount'; end if;
  if p_paid_amount > 0 and p_payment_method is null then raise exception 'payment_method_required'; end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.store_id = p_store_id
  ) then raise exception 'customer_not_found'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or coalesce(v_item->>'product_id', '') = ''
       or coalesce(v_item->>'quantity', '') = '' then
      raise exception 'invalid_sale_item';
    end if;
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'invalid_sale_item';
    end;
    if v_quantity <= 0 or v_quantity <> round(v_quantity, 3) then raise exception 'invalid_sale_quantity'; end if;
  end loop;

  if (select count(*) <> count(distinct (value->>'product_id')::uuid) from jsonb_array_elements(p_items)) then
    raise exception 'duplicate_sale_product';
  end if;

  select jsonb_agg(
    jsonb_build_object('product_id', (item->>'product_id')::uuid, 'quantity', (item->>'quantity')::numeric)
    order by (item->>'product_id')::uuid
  )
  into v_normalized_items
  from jsonb_array_elements(p_items) as items(item);

  v_fingerprint := pg_catalog.md5(jsonb_build_object(
    'items', v_normalized_items,
    'payment_method', p_payment_method::text,
    'paid_amount', p_paid_amount,
    'customer_id', p_customer_id,
    'notes', nullif(btrim(coalesce(p_notes, '')), '')
  )::text);

  insert into public.sales (store_id, customer_id, status, notes, created_by, idempotency_key, request_fingerprint)
  values (p_store_id, p_customer_id, 'draft'::public.sale_status, nullif(btrim(coalesce(p_notes, '')), ''), v_user_id, p_idempotency_key, v_fingerprint)
  on conflict (store_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    select s.id, s.request_fingerprint into v_sale_id, v_existing_fingerprint
    from public.sales s
    where s.store_id = p_store_id and s.idempotency_key = p_idempotency_key
    for update;
    if v_sale_id is null then raise exception 'idempotency_conflict_retry'; end if;
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    return v_sale_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(v_normalized_items)
    order by (value->>'product_id')::uuid
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    select p.name, p.sku, p.sale_price, p.track_stock
    into v_product_name, v_sku, v_unit_price, v_track_stock
    from public.products p
    where p.id = v_product_id and p.store_id = p_store_id and p.status = 'active'::public.record_status
    for update;
    if not found then raise exception 'product_not_found'; end if;

    if v_track_stock then
      if not v_location_loaded then
        select il.id into v_location_id
        from public.inventory_locations il
        where il.store_id = p_store_id and il.is_default = true and il.status = 'active'::public.record_status
        limit 1;
        if v_location_id is null then raise exception 'default_inventory_location_missing'; end if;
        v_location_loaded := true;
      end if;

      select coalesce(sum(im.quantity_delta), 0) into v_stock
      from public.inventory_movements im
      where im.store_id = p_store_id and im.product_id = v_product_id and im.location_id = v_location_id;
      if v_stock < v_quantity then raise exception 'insufficient_stock:%', v_product_name; end if;
    end if;

    v_line_total := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.sale_items (
      store_id, sale_id, product_id, product_name, sku, quantity, unit_price, discount_amount, tax_rate, line_total
    ) values (
      p_store_id, v_sale_id, v_product_id, v_product_name, v_sku, v_quantity, v_unit_price, 0, 0, v_line_total
    );

    if v_track_stock then
      insert into public.inventory_movements (
        store_id, product_id, location_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_by
      ) values (
        p_store_id, v_product_id, v_location_id, 'sale'::public.stock_movement_type, -v_quantity, 'sale', v_sale_id, 'Saída por venda', v_user_id
      );
    end if;
  end loop;

  v_total := round(v_subtotal, 2);
  if p_paid_amount > v_total then raise exception 'paid_amount_exceeds_sale_total'; end if;

  update public.sales
  set subtotal = v_total, total = v_total, status = 'confirmed'::public.sale_status, sold_at = now(), updated_at = now()
  where id = v_sale_id and store_id = p_store_id;

  if p_paid_amount > 0 then
    insert into public.payments (store_id, sale_id, method, status, amount, currency_code, paid_at)
    values (p_store_id, v_sale_id, p_payment_method, 'confirmed'::public.payment_status, p_paid_amount, 'AOA', now());
  end if;

  return v_sale_id;
end;
$$;

revoke all on function private.create_sale_with_payment_internal(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) from public, anon;
grant execute on function private.create_sale_with_payment_internal(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) to authenticated;

create or replace function public.create_sale_with_payment(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_paid_amount numeric default 0,
  p_customer_id uuid default null,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_sale_with_payment_internal(
    p_store_id, p_items, p_payment_method, p_paid_amount,
    p_customer_id, p_notes, p_idempotency_key
  );
$$;

revoke all on function public.create_sale_with_payment(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) from public, anon;
grant execute on function public.create_sale_with_payment(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) to authenticated;

-- ============================================================================
-- PARTE 3: Compras e recepção de stock atómica (20261120093714 + 20261120093753)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'purchase_status'
  ) then
    create type public.purchase_status as enum ('draft', 'received', 'cancelled');
  end if;
end;
$$;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_number bigint generated by default as identity not null,
  supplier_id uuid,
  supplier_reference text,
  status public.purchase_status not null default 'received',
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  received_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid,
  request_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_store_id_id_key unique (store_id, id),
  constraint purchases_store_id_number_key unique (store_id, purchase_number),
  constraint purchases_store_supplier_fkey foreign key (store_id, supplier_id)
    references public.suppliers(store_id, id) on delete restrict,
  constraint purchases_subtotal_check check (subtotal >= 0),
  constraint purchases_total_check check (total >= 0),
  constraint purchases_supplier_reference_check check (supplier_reference is null or char_length(supplier_reference) <= 120)
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  purchase_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  sku text,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint purchase_items_quantity_check check (quantity > 0),
  constraint purchase_items_unit_cost_check check (unit_cost >= 0),
  constraint purchase_items_line_total_check check (line_total >= 0),
  constraint purchase_items_store_purchase_fkey foreign key (store_id, purchase_id)
    references public.purchases(store_id, id) on delete restrict,
  constraint purchase_items_store_product_fkey foreign key (store_id, product_id)
    references public.products(store_id, id) on delete restrict
);

create unique index if not exists purchases_store_idempotency_key_uidx
  on public.purchases(store_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists purchases_store_created_at_idx on public.purchases(store_id, created_at desc);
create index if not exists purchases_store_supplier_idx on public.purchases(store_id, supplier_id) where supplier_id is not null;
create index if not exists purchase_items_store_purchase_idx on public.purchase_items(store_id, purchase_id);
create index if not exists purchase_items_store_product_idx on public.purchase_items(store_id, product_id);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists purchases_read_member on public.purchases;
create policy purchases_read_member on public.purchases for select to authenticated
using (public.has_store_access(store_id));

drop policy if exists purchase_items_read_member on public.purchase_items;
create policy purchase_items_read_member on public.purchase_items for select to authenticated
using (public.has_store_access(store_id));

revoke all on table public.purchases, public.purchase_items from anon, authenticated;
grant select on table public.purchases, public.purchase_items to authenticated;
grant all privileges on table public.purchases, public.purchase_items to service_role;

drop policy if exists inventory_movements_insert_stock_in on public.inventory_movements;
create policy inventory_movements_insert_stock_in
on public.inventory_movements for insert to authenticated
with check (
  public.has_store_role(store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role])
  and created_by = (select auth.uid())
  and movement_type in ('opening'::public.stock_movement_type, 'return_in'::public.stock_movement_type)
  and quantity_delta > 0
);

create or replace function private.create_purchase_with_receipt_internal(
  p_store_id uuid, p_items jsonb, p_supplier_id uuid default null,
  p_supplier_reference text default null, p_notes text default null, p_idempotency_key uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_purchase_id uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_normalized_items jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_product_name text;
  v_sku text;
  v_unit_cost numeric(14,2);
  v_quantity numeric(14,3);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_location_id uuid;
  v_track_stock boolean;
  v_location_loaded boolean := false;
  v_reference text := nullif(btrim(coalesce(p_supplier_reference, '')), '');
  v_clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_role(p_store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]) then
    raise exception 'insufficient_store_role';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'invalid_purchase_items'; end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then raise exception 'invalid_purchase_items'; end if;
  if v_reference is not null and char_length(v_reference) > 120 then raise exception 'invalid_supplier_reference'; end if;
  if v_clean_notes is not null and char_length(v_clean_notes) > 500 then raise exception 'invalid_purchase_notes'; end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id=p_supplier_id and s.store_id=p_store_id and s.status='active'::public.record_status
  ) then raise exception 'supplier_not_found'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or coalesce(v_item->>'product_id','')=''
       or coalesce(v_item->>'quantity','')=''
       or coalesce(v_item->>'unit_cost','')='' then raise exception 'invalid_purchase_item'; end if;
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
      v_unit_cost := (v_item->>'unit_cost')::numeric;
    exception when others then raise exception 'invalid_purchase_item'; end;
    if v_quantity <= 0 or v_quantity <> round(v_quantity,3) then raise exception 'invalid_purchase_quantity'; end if;
    if v_unit_cost < 0 or v_unit_cost <> round(v_unit_cost,2) then raise exception 'invalid_purchase_unit_cost'; end if;
  end loop;

  if (select count(*) <> count(distinct (value->>'product_id')::uuid) from jsonb_array_elements(p_items)) then
    raise exception 'duplicate_purchase_product';
  end if;

  select jsonb_agg(jsonb_build_object(
    'product_id',(item->>'product_id')::uuid,
    'quantity',(item->>'quantity')::numeric,
    'unit_cost',(item->>'unit_cost')::numeric
  ) order by (item->>'product_id')::uuid)
  into v_normalized_items
  from jsonb_array_elements(p_items) as items(item);

  v_fingerprint := pg_catalog.md5(jsonb_build_object(
    'items',v_normalized_items,'supplier_id',p_supplier_id,
    'supplier_reference',v_reference,'notes',v_clean_notes
  )::text);

  insert into public.purchases(store_id,supplier_id,supplier_reference,status,notes,created_by,idempotency_key,request_fingerprint)
  values(p_store_id,p_supplier_id,v_reference,'received'::public.purchase_status,v_clean_notes,v_user_id,p_idempotency_key,v_fingerprint)
  on conflict(store_id,idempotency_key) where idempotency_key is not null do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    select p.id,p.request_fingerprint into v_purchase_id,v_existing_fingerprint
    from public.purchases p where p.store_id=p_store_id and p.idempotency_key=p_idempotency_key for update;
    if v_purchase_id is null then raise exception 'idempotency_conflict_retry'; end if;
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'idempotency_key_reused_with_different_payload'; end if;
    return v_purchase_id;
  end if;

  for v_item in select value from jsonb_array_elements(v_normalized_items) order by (value->>'product_id')::uuid
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost')::numeric;

    select p.name,p.sku,p.track_stock into v_product_name,v_sku,v_track_stock
    from public.products p
    where p.id=v_product_id and p.store_id=p_store_id and p.status='active'::public.record_status
    for update;
    if not found then raise exception 'product_not_found'; end if;

    v_line_total := round(v_quantity*v_unit_cost,2);
    v_subtotal := v_subtotal+v_line_total;

    insert into public.purchase_items(store_id,purchase_id,product_id,product_name,sku,quantity,unit_cost,line_total)
    values(p_store_id,v_purchase_id,v_product_id,v_product_name,v_sku,v_quantity,v_unit_cost,v_line_total);

    if v_track_stock then
      if not v_location_loaded then
        select il.id into v_location_id from public.inventory_locations il
        where il.store_id=p_store_id and il.is_default=true and il.status='active'::public.record_status limit 1;
        if v_location_id is null then raise exception 'default_inventory_location_missing'; end if;
        v_location_loaded := true;
      end if;

      insert into public.inventory_movements(store_id,product_id,location_id,movement_type,quantity_delta,unit_cost,reference_type,reference_id,notes,created_by)
      values(p_store_id,v_product_id,v_location_id,'purchase'::public.stock_movement_type,v_quantity,v_unit_cost,'purchase',v_purchase_id,'Entrada por compra',v_user_id);
    end if;
  end loop;

  update public.purchases set subtotal=round(v_subtotal,2),total=round(v_subtotal,2),received_at=now(),updated_at=now()
  where id=v_purchase_id and store_id=p_store_id;
  return v_purchase_id;
end;
$$;

revoke all on function private.create_purchase_with_receipt_internal(uuid,jsonb,uuid,text,text,uuid) from public,anon;
grant execute on function private.create_purchase_with_receipt_internal(uuid,jsonb,uuid,text,text,uuid) to authenticated;

create or replace function public.create_purchase_with_receipt(
  p_store_id uuid,p_items jsonb,p_supplier_id uuid default null,
  p_supplier_reference text default null,p_notes text default null,p_idempotency_key uuid default null
)
returns uuid language sql security invoker set search_path=''
as $$
  select private.create_purchase_with_receipt_internal(p_store_id,p_items,p_supplier_id,p_supplier_reference,p_notes,p_idempotency_key);
$$;

revoke all on function public.create_purchase_with_receipt(uuid,jsonb,uuid,text,text,uuid) from public,anon;
grant execute on function public.create_purchase_with_receipt(uuid,jsonb,uuid,text,text,uuid) to authenticated;

-- ============================================================================
-- PARTE 4: Operações atómicas de caixa e despesas (20261120104412)
-- ============================================================================

alter table public.cash_sessions
  add column if not exists idempotency_key uuid,
  add column if not exists request_fingerprint text,
  add column if not exists close_idempotency_key uuid,
  add column if not exists close_request_fingerprint text;

alter table public.cash_movements
  add column if not exists idempotency_key uuid,
  add column if not exists request_fingerprint text;

alter table public.expenses
  add column if not exists idempotency_key uuid,
  add column if not exists request_fingerprint text;

create unique index if not exists cash_sessions_store_idempotency_key_uidx
  on public.cash_sessions (store_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists cash_sessions_store_close_idempotency_key_uidx
  on public.cash_sessions (store_id, close_idempotency_key)
  where close_idempotency_key is not null;

create unique index if not exists cash_movements_store_idempotency_key_uidx
  on public.cash_movements (store_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists expenses_store_idempotency_key_uidx
  on public.expenses (store_id, idempotency_key)
  where idempotency_key is not null;

drop policy if exists cash_sessions_insert_member on public.cash_sessions;
drop policy if exists cash_sessions_update_manager on public.cash_sessions;
drop policy if exists cash_movements_insert_member on public.cash_movements;
drop policy if exists cash_movements_update_admin on public.cash_movements;
drop policy if exists cash_movements_delete_admin on public.cash_movements;
drop policy if exists expenses_insert_manager on public.expenses;
drop policy if exists expenses_update_manager on public.expenses;
drop policy if exists expenses_delete_admin on public.expenses;

revoke insert, update, delete on public.cash_sessions from anon, authenticated;
revoke insert, update, delete on public.cash_movements from anon, authenticated;
revoke insert, update, delete on public.expenses from anon, authenticated;
grant select on public.cash_sessions, public.cash_movements, public.expenses to authenticated;

create or replace function private.open_cash_session_internal(
  p_store_id uuid,
  p_register_id uuid,
  p_opening_amount numeric,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_fingerprint text;
  v_existing_fingerprint text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_role(p_store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]) then
    raise exception 'insufficient_store_role';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if p_opening_amount is null or p_opening_amount < 0 or p_opening_amount <> round(p_opening_amount, 2) then
    raise exception 'invalid_opening_amount';
  end if;
  if nullif(btrim(coalesce(p_notes, '')), '') is not null and char_length(btrim(p_notes)) > 500 then
    raise exception 'invalid_cash_notes';
  end if;
  if not exists (
    select 1 from public.cash_registers r
    where r.id = p_register_id and r.store_id = p_store_id and r.status = 'active'::public.record_status
  ) then raise exception 'cash_register_not_found'; end if;

  v_fingerprint := pg_catalog.md5(jsonb_build_object(
    'register_id', p_register_id, 'opening_amount', p_opening_amount,
    'notes', nullif(btrim(coalesce(p_notes, '')), '')
  )::text);

  insert into public.cash_sessions (
    store_id, register_id, opened_by, opening_amount, notes, idempotency_key, request_fingerprint
  ) values (
    p_store_id, p_register_id, v_user_id, p_opening_amount,
    nullif(btrim(coalesce(p_notes, '')), ''), p_idempotency_key, v_fingerprint
  ) on conflict (store_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id, request_fingerprint into v_session_id, v_existing_fingerprint
    from public.cash_sessions
    where store_id = p_store_id and idempotency_key = p_idempotency_key
    for update;
    if v_session_id is null then raise exception 'idempotency_conflict_retry'; end if;
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
  end if;
  return v_session_id;
end;
$$;

create or replace function private.record_cash_movement_internal(
  p_store_id uuid,
  p_session_id uuid,
  p_movement_type text,
  p_direction text,
  p_amount numeric,
  p_description text,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_movement_id uuid;
  v_fingerprint text;
  v_existing_fingerprint text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_role(p_store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]) then
    raise exception 'insufficient_store_role';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if p_movement_type not in ('deposit', 'withdrawal', 'adjustment') then raise exception 'invalid_cash_movement_type'; end if;
  if p_direction not in ('in', 'out') then raise exception 'invalid_cash_direction'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'invalid_cash_amount'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null or char_length(btrim(p_description)) > 500 then
    raise exception 'invalid_cash_description';
  end if;
  if (p_movement_type = 'deposit' and p_direction <> 'in')
     or (p_movement_type = 'withdrawal' and p_direction <> 'out') then
    raise exception 'invalid_cash_movement_direction';
  end if;
  perform 1 from public.cash_sessions s
  where s.id = p_session_id and s.store_id = p_store_id and s.closed_at is null
  for update;
  if not found then raise exception 'cash_session_not_open'; end if;

  v_fingerprint := pg_catalog.md5(jsonb_build_object(
    'session_id', p_session_id, 'movement_type', p_movement_type,
    'direction', p_direction, 'amount', p_amount, 'description', btrim(p_description)
  )::text);
  insert into public.cash_movements (
    store_id, session_id, movement_type, direction, amount, description,
    created_by, idempotency_key, request_fingerprint
  ) values (
    p_store_id, p_session_id, p_movement_type, p_direction, p_amount, btrim(p_description),
    v_user_id, p_idempotency_key, v_fingerprint
  ) on conflict (store_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_movement_id;

  if v_movement_id is null then
    select id, request_fingerprint into v_movement_id, v_existing_fingerprint
    from public.cash_movements where store_id = p_store_id and idempotency_key = p_idempotency_key
    for update;
    if v_movement_id is null then raise exception 'idempotency_conflict_retry'; end if;
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'idempotency_key_reused_with_different_payload'; end if;
  end if;
  return v_movement_id;
end;
$$;

create or replace function private.close_cash_session_internal(
  p_store_id uuid,
  p_session_id uuid,
  p_counted_amount numeric,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_expected numeric(14,2);
  v_fingerprint text;
  v_existing_fingerprint text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_role(p_store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]) then raise exception 'insufficient_store_role'; end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if p_counted_amount is null or p_counted_amount < 0 or p_counted_amount <> round(p_counted_amount, 2) then raise exception 'invalid_closing_amount'; end if;
  if nullif(btrim(coalesce(p_notes, '')), '') is not null and char_length(btrim(p_notes)) > 500 then raise exception 'invalid_cash_notes'; end if;
  v_fingerprint := pg_catalog.md5(jsonb_build_object('counted_amount', p_counted_amount, 'notes', nullif(btrim(coalesce(p_notes, '')), ''))::text);

  perform 1 from public.cash_sessions s where s.id = p_session_id and s.store_id = p_store_id for update;
  if not found then raise exception 'cash_session_not_found'; end if;
  select close_request_fingerprint into v_existing_fingerprint from public.cash_sessions where id = p_session_id;
  if (select closed_at is not null from public.cash_sessions where id = p_session_id) then
    if (select close_idempotency_key from public.cash_sessions where id = p_session_id) = p_idempotency_key
       and v_existing_fingerprint = v_fingerprint then return p_session_id; end if;
    raise exception 'cash_session_already_closed';
  end if;

  select round(s.opening_amount + coalesce(sum(case when m.direction = 'in' then m.amount else -m.amount end), 0), 2)
  into v_expected
  from public.cash_sessions s left join public.cash_movements m on m.session_id = s.id and m.store_id = s.store_id
  where s.id = p_session_id and s.store_id = p_store_id
  group by s.opening_amount;

  update public.cash_sessions set
    closed_by = v_user_id, closing_amount = p_counted_amount, expected_amount = v_expected,
    difference_amount = round(p_counted_amount - v_expected, 2), closed_at = now(),
    notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
    close_idempotency_key = p_idempotency_key, close_request_fingerprint = v_fingerprint
  where id = p_session_id and store_id = p_store_id;
  return p_session_id;
end;
$$;

create or replace function private.record_cash_expense_internal(
  p_store_id uuid,
  p_session_id uuid,
  p_description text,
  p_category text,
  p_amount numeric,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_expense_id uuid;
  v_fingerprint text;
  v_existing_fingerprint text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.has_store_role(p_store_id, array['owner'::public.store_role, 'admin'::public.store_role, 'manager'::public.store_role]) then raise exception 'insufficient_store_role'; end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null or char_length(btrim(p_description)) > 500 then raise exception 'invalid_expense_description'; end if;
  if p_category is not null and char_length(btrim(p_category)) > 120 then raise exception 'invalid_expense_category'; end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 500 then raise exception 'invalid_expense_notes'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'invalid_expense_amount'; end if;
  perform 1 from public.cash_sessions s where s.id = p_session_id and s.store_id = p_store_id and s.closed_at is null for update;
  if not found then raise exception 'cash_session_not_open'; end if;

  v_fingerprint := pg_catalog.md5(jsonb_build_object(
    'session_id', p_session_id, 'description', btrim(p_description), 'category', nullif(btrim(coalesce(p_category, '')), ''),
    'amount', p_amount, 'notes', nullif(btrim(coalesce(p_notes, '')), '')
  )::text);
  insert into public.expenses (
    store_id, description, category, amount, currency_code, incurred_at, payment_method, notes,
    created_by, idempotency_key, request_fingerprint
  ) values (
    p_store_id, btrim(p_description), nullif(btrim(coalesce(p_category, '')), ''), p_amount, 'AOA', now(),
    'cash'::public.payment_method, nullif(btrim(coalesce(p_notes, '')), ''), v_user_id, p_idempotency_key, v_fingerprint
  ) on conflict (store_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_expense_id;

  if v_expense_id is null then
    select id, request_fingerprint into v_expense_id, v_existing_fingerprint
    from public.expenses where store_id = p_store_id and idempotency_key = p_idempotency_key for update;
    if v_expense_id is null then raise exception 'idempotency_conflict_retry'; end if;
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'idempotency_key_reused_with_different_payload'; end if;
    return v_expense_id;
  end if;

  insert into public.cash_movements (
    store_id, session_id, movement_type, direction, amount, description, reference_type, reference_id, created_by,
    idempotency_key, request_fingerprint
  ) values (
    p_store_id, p_session_id, 'expense', 'out', p_amount, btrim(p_description), 'expense', v_expense_id, v_user_id,
    p_idempotency_key, v_fingerprint
  );
  return v_expense_id;
end;
$$;

create or replace function public.open_cash_session(p_store_id uuid, p_register_id uuid, p_opening_amount numeric, p_notes text default null, p_idempotency_key uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.open_cash_session_internal(p_store_id, p_register_id, p_opening_amount, p_notes, p_idempotency_key);
$$;
create or replace function public.record_cash_movement(p_store_id uuid, p_session_id uuid, p_movement_type text, p_direction text, p_amount numeric, p_description text, p_idempotency_key uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.record_cash_movement_internal(p_store_id, p_session_id, p_movement_type, p_direction, p_amount, p_description, p_idempotency_key);
$$;
create or replace function public.close_cash_session(p_store_id uuid, p_session_id uuid, p_counted_amount numeric, p_notes text default null, p_idempotency_key uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.close_cash_session_internal(p_store_id, p_session_id, p_counted_amount, p_notes, p_idempotency_key);
$$;
create or replace function public.record_cash_expense(p_store_id uuid, p_session_id uuid, p_description text, p_category text, p_amount numeric, p_notes text default null, p_idempotency_key uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.record_cash_expense_internal(p_store_id, p_session_id, p_description, p_category, p_amount, p_notes, p_idempotency_key);
$$;

revoke all on function private.open_cash_session_internal(uuid,uuid,numeric,text,uuid) from public, anon;
revoke all on function private.record_cash_movement_internal(uuid,uuid,text,text,numeric,text,uuid) from public, anon;
revoke all on function private.close_cash_session_internal(uuid,uuid,numeric,text,uuid) from public, anon;
revoke all on function private.record_cash_expense_internal(uuid,uuid,text,text,numeric,text,uuid) from public, anon;
grant execute on function private.open_cash_session_internal(uuid,uuid,numeric,text,uuid) to authenticated;
grant execute on function private.record_cash_movement_internal(uuid,uuid,text,text,numeric,text,uuid) to authenticated;
grant execute on function private.close_cash_session_internal(uuid,uuid,numeric,text,uuid) to authenticated;
grant execute on function private.record_cash_expense_internal(uuid,uuid,text,text,numeric,text,uuid) to authenticated;
revoke all on function public.open_cash_session(uuid,uuid,numeric,text,uuid) from public, anon;
revoke all on function public.record_cash_movement(uuid,uuid,text,text,numeric,text,uuid) from public, anon;
revoke all on function public.close_cash_session(uuid,uuid,numeric,text,uuid) from public, anon;
revoke all on function public.record_cash_expense(uuid,uuid,text,text,numeric,text,uuid) from public, anon;
grant execute on function public.open_cash_session(uuid,uuid,numeric,text,uuid) to authenticated;
grant execute on function public.record_cash_movement(uuid,uuid,text,text,numeric,text,uuid) to authenticated;
grant execute on function public.close_cash_session(uuid,uuid,numeric,text,uuid) to authenticated;
grant execute on function public.record_cash_expense(uuid,uuid,text,text,numeric,text,uuid) to authenticated;

-- ============================================================================
-- PARTE 5: 20261120120000 + 20261121080000_atomic_domain_audit.sql (RPCs comerciais com auditoria)
-- ============================================================================

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

revoke all on function public.write_audit_log(uuid,text,text,uuid,text,jsonb) from public, anon;
grant execute on function public.write_audit_log(uuid,text,text,uuid,text,jsonb) to authenticated;

create or replace function public.write_operation_audit_log(
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

create or replace function public.create_sale_with_audit(
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

create or replace function public.record_cash_movement_with_audit(
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

create or replace function public.create_purchase_with_audit(
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

create or replace function public.open_cash_session_with_audit(
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

create or replace function public.close_cash_session_with_audit(
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

create or replace function public.record_cash_expense_with_audit(
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

create or replace function public.create_product_with_audit(
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

create or replace function public.create_category_with_audit(
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

create or replace function public.create_customer_with_audit(
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

create or replace function public.create_supplier_with_audit(
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

create or replace function public.record_stock_entry_with_audit(
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

revoke all on function public.write_operation_audit_log(uuid,text,text,uuid,text,jsonb,uuid) from public, anon;
grant execute on function public.write_operation_audit_log(uuid,text,text,uuid,text,jsonb,uuid) to authenticated;

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

-- ============================================================================
-- PARTE 6: 20261121100000_whatsapp_durable_processing.sql (WhatsApp durável)
-- ============================================================================

alter table public.whatsapp_conversations add column if not exists connection_id uuid;
alter table public.whatsapp_messages add column if not exists connection_id uuid;

update public.whatsapp_conversations c
set connection_id = w.id
from public.whatsapp_connections w
where c.store_id = w.store_id
  and c.connection_id is null;

update public.whatsapp_messages m
set connection_id = c.connection_id
from public.whatsapp_conversations c
where m.store_id = c.store_id
  and m.conversation_id = c.id
  and m.connection_id is null;

do $$
begin
  if not exists (select 1 from public.whatsapp_conversations where connection_id is null) then
    alter table public.whatsapp_conversations alter column connection_id set not null;
  end if;
  if not exists (select 1 from public.whatsapp_messages where connection_id is null) then
    alter table public.whatsapp_messages alter column connection_id set not null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_conversations_store_connection_fkey'
  ) then
    alter table public.whatsapp_conversations
      add constraint whatsapp_conversations_store_connection_fkey
      foreign key (store_id, connection_id)
      references public.whatsapp_connections(store_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_messages_store_connection_fkey'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_store_connection_fkey
      foreign key (store_id, connection_id)
      references public.whatsapp_connections(store_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_messages_store_id_id_key'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_store_id_id_key unique (store_id, id);
  end if;
end;
$$;

alter table public.whatsapp_connections drop constraint if exists whatsapp_connections_store_id_key;
alter table public.baileys_auth_state drop constraint if exists baileys_auth_state_store_id_session_id_key_type_key_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baileys_auth_state_connection_session_key_type_key_id_key'
  ) then
    alter table public.baileys_auth_state
      add constraint baileys_auth_state_connection_session_key_type_key_id_key
      unique (store_id, connection_id, session_id, key_type, key_id);
  end if;
end;
$$;

drop index if exists public.whatsapp_external_message_uq;
create unique index if not exists whatsapp_external_message_connection_uq
  on public.whatsapp_messages(store_id, connection_id, external_message_id)
  where external_message_id is not null;

create unique index if not exists whatsapp_conversations_store_connection_contact_uq
  on public.whatsapp_conversations(store_id, connection_id, wa_contact);

create table if not exists public.whatsapp_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  connection_id uuid not null,
  message_id uuid not null,
  idempotency_key text not null,
  status text not null default 'pending',
  attempts smallint not null default 0,
  max_attempts smallint not null default 8,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_jobs_idempotency_key_check check (char_length(btrim(idempotency_key)) between 1 and 200),
  constraint whatsapp_jobs_status_check check (status in ('pending', 'processing', 'retry_wait', 'completed', 'dead_letter')),
  constraint whatsapp_jobs_attempts_check check (attempts >= 0 and max_attempts between 1 and 20 and attempts <= max_attempts),
  constraint whatsapp_jobs_lease_check check (
    (status = 'processing' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_owner is null and lease_token is null and lease_expires_at is null)
  ),
  constraint whatsapp_jobs_store_connection_idempotency_key unique (store_id, connection_id, idempotency_key)
);

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  connection_id uuid not null,
  conversation_id uuid not null,
  idempotency_key uuid not null,
  recipient text not null,
  body text not null,
  status text not null default 'queued',
  attempts smallint not null default 0,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_outbox_recipient_check check (char_length(btrim(recipient)) between 1 and 128),
  constraint whatsapp_outbox_body_check check (char_length(body) between 1 and 4096),
  constraint whatsapp_outbox_status_check check (status in ('queued', 'sending', 'sent', 'failed', 'unknown')),
  constraint whatsapp_outbox_attempts_check check (attempts >= 0 and attempts <= 20),
  constraint whatsapp_outbox_lease_check check (
    (status = 'sending' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or (status <> 'sending' and lease_owner is null and lease_token is null and lease_expires_at is null)
  ),
  constraint whatsapp_outbox_store_connection_idempotency_key unique (store_id, connection_id, idempotency_key)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_jobs_store_connection_fkey') then
    alter table public.whatsapp_jobs
      add constraint whatsapp_jobs_store_connection_fkey
      foreign key (store_id, connection_id)
      references public.whatsapp_connections(store_id, id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_jobs_store_message_fkey') then
    alter table public.whatsapp_jobs
      add constraint whatsapp_jobs_store_message_fkey
      foreign key (store_id, message_id)
      references public.whatsapp_messages(store_id, id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_outbox_store_connection_fkey') then
    alter table public.whatsapp_outbox
      add constraint whatsapp_outbox_store_connection_fkey
      foreign key (store_id, connection_id)
      references public.whatsapp_connections(store_id, id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_outbox_store_conversation_fkey') then
    alter table public.whatsapp_outbox
      add constraint whatsapp_outbox_store_conversation_fkey
      foreign key (store_id, conversation_id)
      references public.whatsapp_conversations(store_id, id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists whatsapp_jobs_claim_idx
  on public.whatsapp_jobs(status, available_at, created_at)
  where status in ('pending', 'retry_wait');

create index if not exists whatsapp_jobs_expired_lease_idx
  on public.whatsapp_jobs(lease_expires_at)
  where status = 'processing';

create index if not exists whatsapp_outbox_claim_idx
  on public.whatsapp_outbox(status, available_at, created_at)
  where status = 'queued';

create index if not exists whatsapp_outbox_expired_lease_idx
  on public.whatsapp_outbox(lease_expires_at)
  where status = 'sending';

alter table public.whatsapp_jobs enable row level security;
alter table public.whatsapp_outbox enable row level security;

grant select, insert, update, delete on public.whatsapp_jobs, public.whatsapp_outbox to service_role;

create or replace function public.enqueue_whatsapp_inbound(
  p_store_id uuid,
  p_connection_id uuid,
  p_sender_id text,
  p_contact_name text,
  p_external_message_id text,
  p_body text,
  p_received_at timestamptz
)
returns table(message_id uuid, job_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
  v_job_id uuid;
  v_inserted boolean;
begin
  if p_store_id is null or p_connection_id is null then raise exception 'invalid_whatsapp_scope'; end if;
  if p_sender_id is null
    or pg_catalog.btrim(p_sender_id) !~ '^[0-9]{1,20}@s\.whatsapp\.net$' then
    raise exception 'invalid_whatsapp_sender';
  end if;
  if p_contact_name is not null and pg_catalog.char_length(pg_catalog.btrim(p_contact_name)) not between 1 and 128 then
    raise exception 'invalid_whatsapp_contact_name';
  end if;
  if p_external_message_id is null
    or pg_catalog.char_length(pg_catalog.btrim(p_external_message_id)) not between 1 and 200 then
    raise exception 'invalid_whatsapp_external_message_id';
  end if;
  if p_body is null or pg_catalog.char_length(p_body) not between 1 and 4096
    or p_body ~ '[[:cntrl:]]' then
    raise exception 'invalid_whatsapp_message_body';
  end if;
  if p_received_at is null
    or p_received_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'invalid_whatsapp_received_at';
  end if;

  insert into public.whatsapp_conversations (
    store_id, connection_id, wa_contact, contact_name, last_message_at
  ) values (
    p_store_id, p_connection_id, pg_catalog.btrim(p_sender_id),
    nullif(pg_catalog.btrim(p_contact_name), ''), p_received_at
  )
  on conflict (store_id, connection_id, wa_contact)
  do update set
    contact_name = coalesce(excluded.contact_name, public.whatsapp_conversations.contact_name),
    last_message_at = greatest(
      coalesce(public.whatsapp_conversations.last_message_at, excluded.last_message_at),
      excluded.last_message_at
    ),
    updated_at = pg_catalog.now()
  returning id into v_conversation_id;

  insert into public.whatsapp_messages (
    store_id, connection_id, conversation_id, external_message_id,
    direction, message_type, body, delivery_status, created_at
  ) values (
    p_store_id, p_connection_id, v_conversation_id, pg_catalog.btrim(p_external_message_id),
    'inbound', 'text', p_body, 'received', p_received_at
  )
  on conflict (store_id, connection_id, external_message_id)
    where external_message_id is not null
  do nothing
  returning id into v_message_id;

  v_inserted := v_message_id is not null;
  if not v_inserted then
    select m.id into v_message_id
    from public.whatsapp_messages m
    where m.store_id = p_store_id
      and m.connection_id = p_connection_id
      and m.external_message_id = pg_catalog.btrim(p_external_message_id)
      and m.direction = 'inbound'
      and m.message_type = 'text';
    if v_message_id is null then raise exception 'whatsapp_inbound_idempotency_conflict'; end if;
  end if;

  insert into public.whatsapp_jobs (
    store_id, connection_id, message_id, idempotency_key
  ) values (
    p_store_id, p_connection_id, v_message_id, pg_catalog.btrim(p_external_message_id)
  )
  on conflict (store_id, connection_id, idempotency_key) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select j.id into v_job_id
    from public.whatsapp_jobs j
    where j.store_id = p_store_id
      and j.connection_id = p_connection_id
      and j.idempotency_key = pg_catalog.btrim(p_external_message_id);
    if v_job_id is null then raise exception 'whatsapp_inbound_job_conflict'; end if;
  end if;

  return query select v_message_id, v_job_id, v_inserted;
end;
$$;

create or replace function public.claim_whatsapp_jobs(
  p_store_id uuid,
  p_lease_owner text,
  p_limit integer default 20,
  p_lease_seconds integer default 60
)
returns setof public.whatsapp_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_store_id is null then raise exception 'invalid_whatsapp_store_id'; end if;
  if p_lease_owner is null or pg_catalog.char_length(pg_catalog.btrim(p_lease_owner)) not between 1 and 120 then
    raise exception 'invalid_whatsapp_lease_owner';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'invalid_whatsapp_job_limit'; end if;
  if p_lease_seconds is null or p_lease_seconds < 10 or p_lease_seconds > 300 then
    raise exception 'invalid_whatsapp_lease_duration';
  end if;

  return query
  with candidates as (
    select j.id
    from public.whatsapp_jobs j
    where j.store_id = p_store_id and (
      (j.status in ('pending', 'retry_wait') and j.available_at <= pg_catalog.now())
      or (j.status = 'processing' and j.lease_expires_at <= pg_catalog.now())
    ) and j.attempts < j.max_attempts
    order by j.available_at, j.created_at
    limit p_limit
    for update skip locked
  )
  update public.whatsapp_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      lease_owner = pg_catalog.btrim(p_lease_owner),
      lease_token = gen_random_uuid(),
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = pg_catalog.now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.claim_whatsapp_outbox(
  p_store_id uuid,
  p_lease_owner text,
  p_limit integer default 20,
  p_lease_seconds integer default 60
)
returns setof public.whatsapp_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_store_id is null then raise exception 'invalid_whatsapp_store_id'; end if;
  if p_lease_owner is null or pg_catalog.char_length(pg_catalog.btrim(p_lease_owner)) not between 1 and 120 then
    raise exception 'invalid_whatsapp_lease_owner';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'invalid_whatsapp_outbox_limit'; end if;
  if p_lease_seconds is null or p_lease_seconds < 10 or p_lease_seconds > 300 then
    raise exception 'invalid_whatsapp_lease_duration';
  end if;

  return query
  with candidates as (
    select o.id
    from public.whatsapp_outbox o
    where o.store_id = p_store_id and o.status = 'queued'
      and o.available_at <= pg_catalog.now() and o.attempts < 20
    order by o.available_at, o.created_at
    limit p_limit
    for update skip locked
  )
  update public.whatsapp_outbox o
  set status = 'sending',
      attempts = o.attempts + 1,
      lease_owner = pg_catalog.btrim(p_lease_owner),
      lease_token = gen_random_uuid(),
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = pg_catalog.now()
  from candidates c
  where o.id = c.id
  returning o.*;
end;
$$;

create or replace function public.finalize_whatsapp_job(
  p_store_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_retry_seconds integer default 30,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_store_id is null or p_job_id is null or p_lease_token is null then raise exception 'invalid_whatsapp_job_lease'; end if;
  if p_outcome is null or p_outcome not in ('completed', 'retry', 'failed') then
    raise exception 'invalid_whatsapp_job_outcome';
  end if;
  if p_retry_seconds is null or p_retry_seconds < 1 or p_retry_seconds > 3600 then
    raise exception 'invalid_whatsapp_retry_delay';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'invalid_whatsapp_error_code';
  end if;

  update public.whatsapp_jobs
  set status = case
        when p_outcome = 'completed' then 'completed'
        when p_outcome = 'retry' and attempts < max_attempts then 'retry_wait'
        else 'dead_letter'
      end,
      available_at = case
        when p_outcome = 'retry' and attempts < max_attempts
          then pg_catalog.now() + pg_catalog.make_interval(secs => p_retry_seconds)
        else available_at
      end,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_error = case when p_outcome = 'completed' then null else p_error_code end,
      updated_at = pg_catalog.now()
  where store_id = p_store_id
    and id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at > pg_catalog.now();
  return found;
end;
$$;

create or replace function public.finalize_whatsapp_outbox(
  p_store_id uuid,
  p_outbox_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_retry_seconds integer default 30,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_store_id is null or p_outbox_id is null or p_lease_token is null then raise exception 'invalid_whatsapp_outbox_lease'; end if;
  if p_outcome is null or p_outcome not in ('sent', 'retry', 'failed', 'unknown') then
    raise exception 'invalid_whatsapp_outbox_outcome';
  end if;
  if p_retry_seconds is null or p_retry_seconds < 1 or p_retry_seconds > 3600 then
    raise exception 'invalid_whatsapp_retry_delay';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'invalid_whatsapp_error_code';
  end if;
  if p_outcome = 'sent' and (p_provider_message_id is null or pg_catalog.char_length(p_provider_message_id) not between 1 and 256) then
    raise exception 'invalid_whatsapp_provider_message_id';
  end if;

  update public.whatsapp_outbox
  set status = case
        when p_outcome = 'retry' and attempts < 20 then 'queued'
        when p_outcome = 'retry' then 'failed'
        else p_outcome
      end,
      available_at = case
        when p_outcome = 'retry' and attempts < 20
          then pg_catalog.now() + pg_catalog.make_interval(secs => p_retry_seconds)
        else available_at
      end,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      provider_message_id = case when p_outcome = 'sent' then p_provider_message_id else provider_message_id end,
      last_error = case when p_outcome = 'sent' then null else p_error_code end,
      updated_at = pg_catalog.now()
  where store_id = p_store_id
    and id = p_outbox_id
    and status = 'sending'
    and lease_token = p_lease_token
    and lease_expires_at > pg_catalog.now();
  return found;
end;
$$;

create or replace function public.reap_expired_whatsapp_jobs(
  p_store_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_store_id is null then raise exception 'invalid_whatsapp_store_id'; end if;
  update public.whatsapp_jobs
  set status = 'dead_letter',
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_error = coalesce(last_error, 'lease expired after maximum attempts'),
      updated_at = pg_catalog.now()
  where store_id = p_store_id
    and status = 'processing'
    and lease_expires_at <= pg_catalog.now()
    and attempts >= max_attempts;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_expired_whatsapp_outbox_unknown(
  p_store_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_store_id is null then raise exception 'invalid_whatsapp_store_id'; end if;
  update public.whatsapp_outbox
  set status = 'unknown',
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_error = coalesce(last_error, 'lease expired; provider delivery is uncertain'),
      updated_at = pg_catalog.now()
  where store_id = p_store_id
    and status = 'sending'
    and lease_expires_at <= pg_catalog.now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_whatsapp_jobs(uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_outbox(uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.enqueue_whatsapp_inbound(uuid,uuid,text,text,text,text,timestamp with time zone) from public, anon, authenticated;
revoke all on function public.finalize_whatsapp_job(uuid,uuid,uuid,text,integer,text) from public, anon, authenticated;
revoke all on function public.finalize_whatsapp_outbox(uuid,uuid,uuid,text,text,integer,text) from public, anon, authenticated;
revoke all on function public.reap_expired_whatsapp_jobs(uuid) from public, anon, authenticated;
revoke all on function public.mark_expired_whatsapp_outbox_unknown(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_jobs(uuid,text,integer,integer) to service_role;
grant execute on function public.claim_whatsapp_outbox(uuid,text,integer,integer) to service_role;
grant execute on function public.enqueue_whatsapp_inbound(uuid,uuid,text,text,text,text,timestamp with time zone) to service_role;
grant execute on function public.finalize_whatsapp_job(uuid,uuid,uuid,text,integer,text) to service_role;
grant execute on function public.finalize_whatsapp_outbox(uuid,uuid,uuid,text,text,integer,text) to service_role;
grant execute on function public.reap_expired_whatsapp_jobs(uuid) to service_role;
grant execute on function public.mark_expired_whatsapp_outbox_unknown(uuid) to service_role;

-- ============================================================================
-- PARTE 7: 20261122090000 + 20261123080000 (Confirmações seguras + índices)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assistant_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  operation text NOT NULL CHECK (
    operation IN (
      'create_sale',
      'create_purchase',
      'open_cash_session',
      'close_cash_session',
      'register_expense'
    )
  ),
  fingerprint text NOT NULL,
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed')),
  result_json jsonb NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_confirmations_store_expires_idx
  ON public.assistant_confirmations (store_id, expires_at);

CREATE INDEX IF NOT EXISTS purchases_created_by_idx
  ON public.purchases (created_by);

ALTER TABLE public.assistant_confirmations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.assistant_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_confirmations TO service_role;

CREATE OR REPLACE FUNCTION public.create_assistant_confirmation(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text,
  p_fingerprint text,
  p_idempotency_key uuid,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_expires_at <= now() OR p_expires_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'confirmation_expiration_out_of_bounds';
  END IF;

  INSERT INTO public.assistant_confirmations (
    token_hash, store_id, user_id, conversation_id, operation,
    fingerprint, idempotency_key, expires_at
  )
  VALUES (
    p_token_hash, p_store_id, p_user_id, p_conversation_id, p_operation,
    p_fingerprint, p_idempotency_key, p_expires_at
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_assistant_confirmation(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text,
  p_fingerprint text,
  p_now timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idempotency_key uuid;
BEGIN
  UPDATE public.assistant_confirmations
  SET status = 'consumed',
      consumed_at = p_now
  WHERE token_hash = p_token_hash
    AND store_id = p_store_id
    AND user_id = p_user_id
    AND conversation_id = p_conversation_id
    AND operation = p_operation
    AND fingerprint = p_fingerprint
    AND status = 'pending'
    AND expires_at > p_now
  RETURNING idempotency_key INTO v_idempotency_key;

  RETURN v_idempotency_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_assistant_confirmation_result(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text,
  p_result_json jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.assistant_confirmations
  SET result_json = p_result_json
  WHERE token_hash = p_token_hash
    AND store_id = p_store_id
    AND user_id = p_user_id
    AND conversation_id = p_conversation_id
    AND operation = p_operation
    AND status = 'consumed'
    AND result_json IS NULL;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_assistant_confirmation_result(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT result_json
  FROM public.assistant_confirmations
  WHERE token_hash = p_token_hash
    AND store_id = p_store_id
    AND user_id = p_user_id
    AND conversation_id = p_conversation_id
    AND operation = p_operation
    AND status = 'consumed'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.create_assistant_confirmation(text, uuid, uuid, uuid, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_assistant_confirmation(text, uuid, uuid, uuid, text, text, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.consume_assistant_confirmation(text, uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assistant_confirmation(text, uuid, uuid, uuid, text, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.save_assistant_confirmation_result(text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_assistant_confirmation_result(text, uuid, uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.get_assistant_confirmation_result(text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_assistant_confirmation_result(text, uuid, uuid, uuid, text) TO service_role;
