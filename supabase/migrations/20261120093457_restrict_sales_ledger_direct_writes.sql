drop policy if exists sales_insert_member on public.sales;
drop policy if exists sales_update_manager on public.sales;
drop policy if exists sales_delete_admin on public.sales;

drop policy if exists sale_items_insert_member on public.sale_items;
drop policy if exists sale_items_update_manager on public.sale_items;
drop policy if exists sale_items_delete_manager on public.sale_items;

revoke insert, update, delete on table public.sales from anon, authenticated;
revoke insert, update, delete on table public.sale_items from anon, authenticated;
