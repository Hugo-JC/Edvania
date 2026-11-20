revoke all on table public.purchases, public.purchase_items from anon, authenticated;
grant select on table public.purchases, public.purchase_items to authenticated;
grant all privileges on table public.purchases, public.purchase_items to service_role;
