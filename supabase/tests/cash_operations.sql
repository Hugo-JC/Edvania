-- Transactional integration checks for atomic cash operations.
-- Run against a disposable Supabase database. All fixture writes are rolled back.

begin;

do $test$
declare
  v_user uuid := gen_random_uuid();
  v_employee uuid := gen_random_uuid();
  v_store uuid;
  v_register uuid;
  v_session uuid;
  v_repeat uuid;
  v_expense uuid;
  v_open_key uuid := gen_random_uuid();
  v_close_key uuid := gen_random_uuid();
  v_movement_key uuid := gen_random_uuid();
  v_expense_key uuid := gen_random_uuid();
  v_movement uuid;
  v_audit_count integer;
  v_expected numeric;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
  (v_user, 'authenticated', 'authenticated', 'cash-owner-' || v_user || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (v_employee, 'authenticated', 'authenticated', 'cash-employee-' || v_employee || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.stores (name, created_by)
  values ('TEST CASH - rollback only', v_user)
  returning id into v_store;

  insert into public.store_memberships (store_id, user_id, role, status, joined_at)
  values (v_store, v_user, 'owner', 'active', now()), (v_store, v_employee, 'employee', 'active', now());

  insert into public.cash_registers (store_id, name)
  values (v_store, 'Test cash')
  returning id into v_register;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_session := public.open_cash_session_with_audit(v_store, v_register, 100, 'opening', v_open_key);
  v_repeat := public.open_cash_session_with_audit(v_store, v_register, 100, 'opening', v_open_key);
  if v_session is distinct from v_repeat then raise exception 'TEST FAILED: open cash idempotency'; end if;
  select count(*) into v_audit_count from public.audit_logs
  where store_id = v_store and action = 'cash_session.opened' and entity_id = v_session
    and metadata ->> 'idempotency_key' = v_open_key::text;
  if v_audit_count <> 1 then raise exception 'TEST FAILED: open cash audit replay duplicated or omitted event'; end if;

  v_movement := public.record_cash_movement_with_audit(v_store, v_session, 'deposit', 'in', 50, 'change deposit', v_movement_key);
  v_repeat := public.record_cash_movement_with_audit(v_store, v_session, 'deposit', 'in', 50, 'change deposit', v_movement_key);
  if v_movement is distinct from v_repeat then raise exception 'TEST FAILED: cash movement idempotency'; end if;
  select count(*) into v_audit_count from public.audit_logs
  where store_id = v_store and action = 'cash_movement.recorded' and entity_id = v_movement
    and metadata ->> 'idempotency_key' = v_movement_key::text;
  if v_audit_count <> 1 then raise exception 'TEST FAILED: cash movement audit replay duplicated or omitted event'; end if;
  v_expense := public.record_cash_expense_with_audit(v_store, v_session, 'supplies', 'operations', 30, 'receipt', v_expense_key);
  v_repeat := public.record_cash_expense_with_audit(v_store, v_session, 'supplies', 'operations', 30, 'receipt', v_expense_key);
  if v_expense is distinct from v_repeat then raise exception 'TEST FAILED: expense idempotency'; end if;
  select count(*) into v_audit_count from public.audit_logs
  where store_id = v_store and action = 'expense.registered' and entity_id = v_expense
    and metadata ->> 'idempotency_key' = v_expense_key::text;
  if v_audit_count <> 1 then raise exception 'TEST FAILED: expense audit replay duplicated or omitted event'; end if;
  if not exists (select 1 from public.cash_movements where id = v_movement and direction = 'in') then raise exception 'TEST FAILED: deposit absent'; end if;
  if not exists (select 1 from public.cash_movements where reference_type = 'expense' and reference_id = v_expense and direction = 'out') then raise exception 'TEST FAILED: expense cash movement absent'; end if;

  perform public.close_cash_session_with_audit(v_store, v_session, 120, 'counted', v_close_key);
  select count(*) into v_audit_count from public.audit_logs
  where store_id = v_store and action = 'cash_session.closed' and entity_id = v_session
    and metadata ->> 'idempotency_key' = v_close_key::text;
  if v_audit_count <> 1 then raise exception 'TEST FAILED: cash close audit missing'; end if;
  select expected_amount into v_expected from public.cash_sessions where id = v_session;
  if v_expected <> 120 then raise exception 'TEST FAILED: expected cash amount %, expected 120', v_expected; end if;

  if has_table_privilege('authenticated', 'public.cash_sessions', 'INSERT')
    or has_table_privilege('authenticated', 'public.cash_movements', 'INSERT')
    or has_table_privilege('authenticated', 'public.expenses', 'INSERT') then
    raise exception 'TEST FAILED: direct DML remains';
  end if;

  perform set_config('request.jwt.claim.sub', v_employee::text, true);
  begin
    perform public.open_cash_session(v_store, v_register, 0, null, gen_random_uuid());
    raise exception 'TEST FAILED: employee opened cash';
  exception when others then
    if sqlerrm not like '%insufficient_store_role%' then raise; end if;
  end;
end;
$test$;

rollback;
