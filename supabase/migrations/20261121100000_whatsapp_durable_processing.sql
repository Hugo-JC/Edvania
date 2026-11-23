do $$
begin
  if exists (
    select 1
    from public.whatsapp_connections
    group by store_id
    having count(*) > 1
  ) then
    raise exception 'whatsapp_connection_migration_requires_single_legacy_connection_per_store';
  end if;
end;
$$;

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
  if exists (select 1 from public.whatsapp_conversations where connection_id is null)
     or exists (select 1 from public.whatsapp_messages where connection_id is null) then
    raise exception 'whatsapp_connection_migration_found_orphaned_records';
  end if;

  if exists (
    select 1
    from public.whatsapp_conversations
    group by store_id, connection_id, wa_contact
    having count(*) > 1
  ) then
    raise exception 'whatsapp_connection_migration_found_duplicate_conversations';
  end if;
end;
$$;

alter table public.whatsapp_conversations alter column connection_id set not null;
alter table public.whatsapp_messages alter column connection_id set not null;

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

alter table public.whatsapp_jobs enable row level security;
alter table public.whatsapp_outbox enable row level security;

grant select, insert, update, delete on public.whatsapp_jobs, public.whatsapp_outbox to service_role;

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
