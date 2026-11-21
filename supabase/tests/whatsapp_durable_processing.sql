-- Transactional checks for connection-scoped WhatsApp persistence and leases.
-- Run only against a disposable Supabase database; fixtures are rolled back.

begin;

do $test$
declare
  v_user uuid := gen_random_uuid();
  v_store uuid;
  v_other_store uuid;
  v_connection_a uuid;
  v_connection_b uuid;
  v_other_connection uuid;
  v_conversation_a uuid;
  v_conversation_b uuid;
  v_other_conversation uuid;
  v_message_a uuid;
  v_message_b uuid;
  v_other_message uuid;
  v_job uuid;
  v_other_job uuid;
  v_ingress_message_id uuid;
  v_ingress_job_id uuid;
  v_ingress_replay_message_id uuid;
  v_ingress_replay_job_id uuid;
  v_ingress_inserted boolean;
  v_ingress_replay_inserted boolean;
  v_job_lease uuid;
  v_old_job_lease uuid;
  v_outbox uuid;
  v_other_outbox uuid;
  v_outbox_lease uuid;
  v_old_outbox_lease uuid;
  v_count integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user, 'authenticated', 'authenticated',
    'whatsapp-test-' || v_user::text || '@example.invalid', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.stores (name, created_by)
  values ('TEST WHATSAPP - rollback only', v_user)
  returning id into v_store;
  insert into public.stores (name, created_by)
  values ('TEST WHATSAPP OTHER - rollback only', v_user)
  returning id into v_other_store;
  insert into public.store_memberships (store_id, user_id, role, status, joined_at)
  values (v_store, v_user, 'owner', 'active', now());

  insert into public.whatsapp_connections (store_id, provider)
  values (v_store, 'baileys')
  returning id into v_connection_a;
  insert into public.whatsapp_connections (store_id, provider)
  values (v_store, 'cloud_api')
  returning id into v_connection_b;
  insert into public.whatsapp_connections (store_id, provider)
  values (v_other_store, 'baileys')
  returning id into v_other_connection;

  insert into public.whatsapp_conversations (store_id, connection_id, wa_contact)
  values (v_store, v_connection_a, '15550000001@s.whatsapp.net')
  returning id into v_conversation_a;
  insert into public.whatsapp_conversations (store_id, connection_id, wa_contact)
  values (v_store, v_connection_b, '15550000001@s.whatsapp.net')
  returning id into v_conversation_b;
  insert into public.whatsapp_conversations (store_id, connection_id, wa_contact)
  values (v_other_store, v_other_connection, '15550000002@s.whatsapp.net')
  returning id into v_other_conversation;

  insert into public.whatsapp_messages (store_id, connection_id, conversation_id, external_message_id, direction, body)
  values (v_store, v_connection_a, v_conversation_a, 'provider-message-1', 'inbound', 'first')
  returning id into v_message_a;
  insert into public.whatsapp_messages (store_id, connection_id, conversation_id, external_message_id, direction, body)
  values (v_store, v_connection_b, v_conversation_b, 'provider-message-1', 'inbound', 'second')
  returning id into v_message_b;
  insert into public.whatsapp_messages (store_id, connection_id, conversation_id, external_message_id, direction, body)
  values (v_other_store, v_other_connection, v_other_conversation, 'provider-message-other-store', 'inbound', 'other store')
  returning id into v_other_message;

  if v_message_a = v_message_b then raise exception 'TEST FAILED: connection messages share a row id'; end if;

  select message_id, job_id, inserted
  into v_ingress_message_id, v_ingress_job_id, v_ingress_inserted
  from public.enqueue_whatsapp_inbound(
    v_store, v_connection_a, '244923456789@s.whatsapp.net', 'Test Contact',
    'rpc-provider-message-1', 'first inbound', now()
  );
  if v_ingress_message_id is null or v_ingress_job_id is null or not v_ingress_inserted then
    raise exception 'TEST FAILED: inbound RPC did not atomically create message and job';
  end if;
  select message_id, job_id, inserted
  into v_ingress_replay_message_id, v_ingress_replay_job_id, v_ingress_replay_inserted
  from public.enqueue_whatsapp_inbound(
    v_store, v_connection_a, '244923456789@s.whatsapp.net', 'Test Contact',
    'rpc-provider-message-1', 'first inbound', now()
  );
  if v_ingress_replay_message_id <> v_ingress_message_id
    or v_ingress_replay_job_id <> v_ingress_job_id
    or v_ingress_replay_inserted then
    raise exception 'TEST FAILED: duplicate inbound delivery was not idempotent';
  end if;

  begin
    perform public.enqueue_whatsapp_inbound(
      v_other_store, v_connection_a, '244923456789@s.whatsapp.net', 'Wrong tenant',
      'cross-tenant-provider-message', 'must reject', now()
    );
    raise exception 'TEST FAILED: inbound RPC accepted connection from another tenant';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.whatsapp_messages (store_id, connection_id, conversation_id, external_message_id, direction)
    values (v_store, v_connection_a, v_conversation_a, 'provider-message-1', 'inbound');
    raise exception 'TEST FAILED: duplicate provider message id was accepted on one connection';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.whatsapp_conversations (store_id, connection_id, wa_contact)
    values (v_other_store, v_connection_a, '15550000002@s.whatsapp.net');
    raise exception 'TEST FAILED: cross-store connection was accepted';
  exception when foreign_key_violation then
    null;
  end;

  insert into public.whatsapp_jobs (store_id, connection_id, message_id, idempotency_key)
  values (v_store, v_connection_a, v_message_a, 'inbound:provider-message-1')
  returning id into v_job;
  insert into public.whatsapp_jobs (store_id, connection_id, message_id, idempotency_key)
  values (v_other_store, v_other_connection, v_other_message, 'inbound:other-store')
  returning id into v_other_job;

  select lease_token into v_job_lease from public.claim_whatsapp_jobs(v_store, 'worker-a', 10, 60)
  where id = v_job;
  if v_job_lease is null then raise exception 'TEST FAILED: pending inbound job was not claimed'; end if;
  if not exists (
    select 1 from public.whatsapp_jobs
    where id = v_other_job and status = 'pending' and lease_token is null
  ) then raise exception 'TEST FAILED: tenant-scoped job claim included another store'; end if;
  v_old_job_lease := v_job_lease;

  select count(*) into v_count from public.claim_whatsapp_jobs(v_store, 'worker-b', 10, 60);
  if v_count <> 0 then raise exception 'TEST FAILED: an unexpired job lease was claimed twice'; end if;

  update public.whatsapp_jobs
  set lease_expires_at = now() - interval '1 minute'
  where id = v_job;
  select lease_token into v_job_lease from public.claim_whatsapp_jobs(v_store, 'worker-b', 10, 60)
  where id = v_job;
  if v_job_lease is null or not exists (
    select 1 from public.whatsapp_jobs where id = v_job and lease_owner = 'worker-b' and attempts = 2
  ) then raise exception 'TEST FAILED: expired job lease was not safely reclaimed'; end if;
  if public.finalize_whatsapp_job(v_store, v_job, v_old_job_lease, 'completed') then
    raise exception 'TEST FAILED: stale worker finalized a reclaimed job';
  end if;
  if public.finalize_whatsapp_job(v_other_store, v_job, v_job_lease, 'completed') then
    raise exception 'TEST FAILED: worker finalized a job under another store scope';
  end if;
  if not public.finalize_whatsapp_job(v_store, v_job, v_job_lease, 'retry', 1, 'temporary_failure') then
    raise exception 'TEST FAILED: current job lease could not schedule a retry';
  end if;
  update public.whatsapp_jobs set available_at = now() - interval '1 minute' where id = v_job;
  select lease_token into v_job_lease from public.claim_whatsapp_jobs(v_store, 'worker-c', 10, 60)
  where id = v_job;
  if v_job_lease is null then raise exception 'TEST FAILED: retryable job could not be reclaimed'; end if;

  update public.whatsapp_jobs
  set attempts = max_attempts, lease_expires_at = now() - interval '1 minute'
  where id = v_job;
  perform public.reap_expired_whatsapp_jobs(v_store);
  if not exists (
    select 1 from public.whatsapp_jobs
    where id = v_job and status = 'dead_letter' and lease_token is null and lease_owner is null
  ) then raise exception 'TEST FAILED: exhausted job was not dead-lettered'; end if;

  insert into public.whatsapp_outbox (
    store_id, connection_id, conversation_id, idempotency_key, recipient, body
  ) values (
    v_store, v_connection_a, v_conversation_a, gen_random_uuid(),
    '15550000001@s.whatsapp.net', 'test response'
  ) returning id into v_outbox;
  insert into public.whatsapp_outbox (
    store_id, connection_id, conversation_id, idempotency_key, recipient, body
  ) values (
    v_other_store, v_other_connection, v_other_conversation, gen_random_uuid(),
    '15550000002@s.whatsapp.net', 'other tenant response'
  ) returning id into v_other_outbox;
  select lease_token into v_outbox_lease from public.claim_whatsapp_outbox(v_store, 'worker-a', 10, 60)
  where id = v_outbox;
  if v_outbox_lease is null then raise exception 'TEST FAILED: queued outbox row was not claimed'; end if;
  if not exists (
    select 1 from public.whatsapp_outbox where id = v_other_outbox and status = 'queued' and lease_token is null
  ) then raise exception 'TEST FAILED: tenant-scoped outbox claim included another store'; end if;
  v_old_outbox_lease := v_outbox_lease;
  update public.whatsapp_outbox
  set lease_expires_at = now() - interval '1 minute'
  where id = v_outbox;
  select lease_token into v_outbox_lease from public.claim_whatsapp_outbox(v_store, 'worker-b', 10, 60)
  where id = v_outbox;
  if v_outbox_lease is null then raise exception 'TEST FAILED: expired outbox lease was not reclaimed'; end if;
  if public.finalize_whatsapp_outbox(v_store, v_outbox, v_old_outbox_lease, 'sent', 'stale-provider-id') then
    raise exception 'TEST FAILED: stale worker finalized a reclaimed outbox item';
  end if;
  if public.finalize_whatsapp_outbox(v_other_store, v_outbox, v_outbox_lease, 'sent', 'cross-tenant-provider-id') then
    raise exception 'TEST FAILED: worker finalized an outbox item under another store scope';
  end if;
  if not public.finalize_whatsapp_outbox(v_store, v_outbox, v_outbox_lease, 'unknown', null, 30, 'delivery_ambiguous') then
    raise exception 'TEST FAILED: current outbox lease could not record ambiguous delivery';
  end if;
  if public.finalize_whatsapp_outbox(v_store, v_outbox, v_outbox_lease, 'sent', 'duplicate-provider-id') then
    raise exception 'TEST FAILED: consumed outbox lease finalized more than once';
  end if;

  insert into public.whatsapp_outbox (
    store_id, connection_id, conversation_id, idempotency_key, recipient, body
  ) values (
    v_store, v_connection_a, v_conversation_a, gen_random_uuid(),
    '15550000001@s.whatsapp.net', 'retry response'
  ) returning id into v_outbox;
  select lease_token into v_outbox_lease from public.claim_whatsapp_outbox(v_store, 'worker-a', 10, 60)
  where id = v_outbox;
  if v_outbox_lease is null or not public.finalize_whatsapp_outbox(v_store, v_outbox, v_outbox_lease, 'retry', null, 1, 'temporary_failure') then
    raise exception 'TEST FAILED: retryable outbox item was not rescheduled';
  end if;
  update public.whatsapp_outbox set available_at = now() - interval '1 minute' where id = v_outbox;
  select lease_token into v_outbox_lease from public.claim_whatsapp_outbox(v_store, 'worker-b', 10, 60)
  where id = v_outbox;
  if v_outbox_lease is null or not public.finalize_whatsapp_outbox(v_store, v_outbox, v_outbox_lease, 'sent', 'provider-message-2') then
    raise exception 'TEST FAILED: retried outbox item was not finalized as sent';
  end if;

  insert into public.whatsapp_outbox (
    store_id, connection_id, conversation_id, idempotency_key, recipient, body
  ) values (
    v_store, v_connection_a, v_conversation_a, gen_random_uuid(),
    '15550000001@s.whatsapp.net', 'expired response'
  ) returning id into v_outbox;
  select lease_token into v_outbox_lease from public.claim_whatsapp_outbox(v_store, 'worker-a', 10, 60)
  where id = v_outbox;
  if v_outbox_lease is null then raise exception 'TEST FAILED: second outbox row was not claimed'; end if;
  update public.whatsapp_outbox set lease_expires_at = now() - interval '1 minute' where id = v_outbox;
  perform public.mark_expired_whatsapp_outbox_unknown(v_store);
  if not exists (
    select 1 from public.whatsapp_outbox
    where id = v_outbox and status = 'unknown' and lease_token is null
  ) then raise exception 'TEST FAILED: expired outbound lease was retried instead of marked unknown'; end if;

  if has_table_privilege('authenticated', 'public.whatsapp_jobs', 'SELECT')
     or has_table_privilege('authenticated', 'public.whatsapp_jobs', 'INSERT')
     or has_table_privilege('authenticated', 'public.whatsapp_outbox', 'SELECT')
     or has_table_privilege('authenticated', 'public.whatsapp_outbox', 'INSERT') then
    raise exception 'TEST FAILED: authenticated role has direct queue or outbox access';
  end if;
  if has_function_privilege('authenticated', 'public.claim_whatsapp_jobs(uuid,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_whatsapp_outbox(uuid,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enqueue_whatsapp_inbound(uuid,uuid,text,text,text,text,timestamp with time zone)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.finalize_whatsapp_job(uuid,uuid,uuid,text,integer,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.finalize_whatsapp_outbox(uuid,uuid,uuid,text,text,integer,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reap_expired_whatsapp_jobs(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.mark_expired_whatsapp_outbox_unknown(uuid)', 'EXECUTE') then
    raise exception 'TEST FAILED: authenticated role can operate worker job RPCs';
  end if;

  raise notice 'PASS: tenant-scoped claims and finalization, connection-scoped deduplication, lease fencing, retry limits and ambiguous outbound handling';
end;
$test$;

rollback;
