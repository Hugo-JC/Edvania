-- Append-only audit RPC. Direct table access remains blocked by audit_logs_backend_only.
create or replace function public.write_audit_log(
 p_store_id uuid,p_action text,p_entity_type text,p_entity_id uuid default null,
 p_request_id text default null,p_metadata jsonb default '{}'::jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := (select auth.uid()); v_id bigint;
begin
 if v_user_id is null then raise exception 'not_authenticated'; end if;
 if not public.has_store_access(p_store_id) then raise exception 'store_access_denied'; end if;
 if p_action not in ('sale.created','purchase.received','cash_session.opened','cash_session.closed','expense.registered') then raise exception 'invalid_audit_action'; end if;
 if p_entity_type not in ('sale','purchase','cash_session','expense') then raise exception 'invalid_audit_entity'; end if;
 if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata)<>'object' or pg_catalog.octet_length(p_metadata::text)>4096 then raise exception 'invalid_audit_metadata'; end if;
 if p_request_id is not null and pg_catalog.char_length(p_request_id)>120 then raise exception 'invalid_audit_request_id'; end if;
 insert into public.audit_logs(store_id,actor_user_id,action,entity_type,entity_id,request_id,metadata)
 values(p_store_id,v_user_id,p_action,p_entity_type,p_entity_id,p_request_id,p_metadata) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.write_audit_log(uuid,text,text,uuid,text,jsonb) from public,anon;
grant execute on function public.write_audit_log(uuid,text,text,uuid,text,jsonb) to authenticated;
