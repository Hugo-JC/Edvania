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

  return v_store_id;
end;
$$;

revoke all on function public.create_store_for_current_user(text) from public, anon;
grant execute on function public.create_store_for_current_user(text) to authenticated;
