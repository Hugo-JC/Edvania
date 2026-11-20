-- Cash is an immutable ledger. Authenticated users can read it, but all writes
-- must go through the domain RPCs below.

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

create function public.open_cash_session(p_store_id uuid, p_register_id uuid, p_opening_amount numeric, p_notes text default null, p_idempotency_key uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.open_cash_session_internal(p_store_id, p_register_id, p_opening_amount, p_notes, p_idempotency_key);
$$;
create function public.record_cash_movement(p_store_id uuid, p_session_id uuid, p_movement_type text, p_direction text, p_amount numeric, p_description text, p_idempotency_key uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.record_cash_movement_internal(p_store_id, p_session_id, p_movement_type, p_direction, p_amount, p_description, p_idempotency_key);
$$;
create function public.close_cash_session(p_store_id uuid, p_session_id uuid, p_counted_amount numeric, p_notes text default null, p_idempotency_key uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.close_cash_session_internal(p_store_id, p_session_id, p_counted_amount, p_notes, p_idempotency_key);
$$;
create function public.record_cash_expense(p_store_id uuid, p_session_id uuid, p_description text, p_category text, p_amount numeric, p_notes text default null, p_idempotency_key uuid default null)
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
