-- Transactional integration checks for Meta H durable assistant confirmations.
-- Run against a disposable Supabase database. All fixture writes are rolled back.

begin;

do $test$
declare
  v_user uuid := gen_random_uuid();
  v_other_user uuid := gen_random_uuid();
  v_store uuid;
  v_other_store uuid;
  v_conv uuid := gen_random_uuid();
  v_token_hash text := encode(gen_random_bytes(32), 'hex');
  v_expired_hash text := encode(gen_random_bytes(32), 'hex');
  v_idempotency uuid := gen_random_uuid();
  v_consumed uuid;
  v_saved boolean;
  v_result jsonb;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
  (v_user, 'authenticated', 'authenticated', 'conf-owner-' || v_user || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (v_other_user, 'authenticated', 'authenticated', 'conf-other-' || v_other_user || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.stores (name, created_by)
  values ('TEST CONFIRMATIONS A', v_user)
  returning id into v_store;

  insert into public.stores (name, created_by)
  values ('TEST CONFIRMATIONS B', v_other_user)
  returning id into v_other_store;

  -- Max 10 min expiration enforcement
  begin
    perform public.create_assistant_confirmation(
      v_expired_hash,
      v_store,
      v_user,
      v_conv,
      'create_sale',
      'fp-too-long',
      gen_random_uuid(),
      now() + interval '15 minutes'
    );
    raise exception 'TEST FAILED: accepted confirmation > 10 minutes';
  exception when others then
    if sqlerrm not like '%confirmation_expiration_out_of_bounds%' then raise; end if;
  end;

  perform public.create_assistant_confirmation(
    v_token_hash,
    v_store,
    v_user,
    v_conv,
    'create_sale',
    'fp-valid-1',
    v_idempotency,
    now() + interval '5 minutes'
  );

  -- Cross-tenant / wrong user / wrong fingerprint must not consume
  if public.consume_assistant_confirmation(v_token_hash, v_other_store, v_user, v_conv, 'create_sale', 'fp-valid-1', now()) is not null then
    raise exception 'TEST FAILED: cross-tenant confirmation consumed';
  end if;
  if public.consume_assistant_confirmation(v_token_hash, v_store, v_other_user, v_conv, 'create_sale', 'fp-valid-1', now()) is not null then
    raise exception 'TEST FAILED: cross-user confirmation consumed';
  end if;
  if public.consume_assistant_confirmation(v_token_hash, v_store, v_user, v_conv, 'create_sale', 'fp-tampered', now()) is not null then
    raise exception 'TEST FAILED: tampered fingerprint consumed';
  end if;

  -- Valid consume succeeds once and returns exact idempotency key
  v_consumed := public.consume_assistant_confirmation(v_token_hash, v_store, v_user, v_conv, 'create_sale', 'fp-valid-1', now());
  if v_consumed is distinct from v_idempotency then
    raise exception 'TEST FAILED: expected %, got %', v_idempotency, v_consumed;
  end if;

  -- Replay consume fails
  if public.consume_assistant_confirmation(v_token_hash, v_store, v_user, v_conv, 'create_sale', 'fp-valid-1', now()) is not null then
    raise exception 'TEST FAILED: confirmation consumed twice';
  end if;

  -- Result persistence is write-once
  v_saved := public.save_assistant_confirmation_result(v_token_hash, v_store, v_user, v_conv, 'create_sale', '{"ok":true,"data":{"saleId":"123"}}'::jsonb);
  if v_saved is not true then
    raise exception 'TEST FAILED: first save_assistant_confirmation_result failed';
  end if;
  v_saved := public.save_assistant_confirmation_result(v_token_hash, v_store, v_user, v_conv, 'create_sale', '{"ok":false}'::jsonb);
  if v_saved is not false then
    raise exception 'TEST FAILED: second save overwrote result_json';
  end if;

  v_result := public.get_assistant_confirmation_result(v_token_hash, v_store, v_user, v_conv, 'create_sale');
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'TEST FAILED: get_assistant_confirmation_result mismatch';
  end if;

  if has_table_privilege('authenticated', 'public.assistant_confirmations', 'SELECT') then
    raise exception 'TEST FAILED: authenticated role has direct access to assistant_confirmations';
  end if;
end;
$test$;

rollback;
