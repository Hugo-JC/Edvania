create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.create_sale_with_payment(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) set schema private;
alter function private.create_sale_with_payment(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) rename to create_sale_with_payment_internal;

revoke all on function private.create_sale_with_payment_internal(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) from public, anon;
grant execute on function private.create_sale_with_payment_internal(uuid, jsonb, public.payment_method, numeric, uuid, text, uuid) to authenticated;

create function public.create_sale_with_payment(
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
