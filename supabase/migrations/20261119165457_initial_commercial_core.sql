-- Edvânia consolidated bootstrap snapshot exported from the verified Supabase schema on 2026-11-19.
-- This clean-install baseline contains the final schema state, including RLS hardening and grants.
-- It is not a byte-for-byte copy of the original remote migration history.
-- The later timestamped files are no-op history markers for changes already included in this snapshot.
-- New schema changes must be added as incremental migrations.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;

create extension if not exists pgcrypto;

create type public.payment_method as enum ('cash', 'bank_transfer', 'multicaixa_reference', 'multicaixa_express', 'other');

create type public.payment_status as enum ('pending', 'confirmed', 'failed', 'cancelled', 'refunded');

create type public.record_status as enum ('active', 'inactive', 'archived');

create type public.sale_status as enum ('draft', 'confirmed', 'cancelled', 'refunded');

create type public.stock_movement_type as enum ('opening', 'purchase', 'sale', 'adjustment', 'return_in', 'return_out', 'transfer_in', 'transfer_out');

create type public.store_role as enum ('owner', 'admin', 'manager', 'employee');

create table public.ai_usage_logs (id uuid default gen_random_uuid() not null, store_id uuid, provider text not null, model text not null, task_type text, prompt_tokens integer, completion_tokens integer, latency_ms integer, status_code integer, success boolean default true not null, estimated_cost numeric(14,6), created_at timestamp with time zone default now() not null);

create table public.angola_municipalities (id uuid default gen_random_uuid() not null, province_id uuid not null, code text not null, name text not null, created_at timestamp with time zone default now() not null);

create table public.angola_provinces (id uuid default gen_random_uuid() not null, code text not null, name text not null, created_at timestamp with time zone default now() not null);

create table public.audit_logs (id bigint generated always as identity not null, store_id uuid, actor_user_id uuid, action text not null, entity_type text not null, entity_id uuid, request_id text, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null);

create table public.automations (id uuid default gen_random_uuid() not null, store_id uuid not null, name text not null, trigger_type text not null, config jsonb default '{}'::jsonb not null, enabled boolean default false not null, created_by uuid, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.baileys_auth_state (id uuid default gen_random_uuid() not null, store_id uuid not null, connection_id uuid not null, session_id text not null, key_type text not null, key_id text not null, encrypted_data text not null, encryption_key_version text not null, updated_at timestamp with time zone default now() not null);

create table public.cash_movements (id uuid default gen_random_uuid() not null, store_id uuid not null, session_id uuid not null, movement_type text not null, amount numeric(14,2) not null, direction text not null, description text, reference_type text, reference_id uuid, created_by uuid, created_at timestamp with time zone default now() not null);

create table public.cash_registers (id uuid default gen_random_uuid() not null, store_id uuid not null, name text not null, location_id uuid, status record_status default 'active'::record_status not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.cash_sessions (id uuid default gen_random_uuid() not null, store_id uuid not null, register_id uuid not null, opened_by uuid not null, closed_by uuid, opening_amount numeric(14,2) default 0 not null, closing_amount numeric(14,2), expected_amount numeric(14,2), difference_amount numeric(14,2), opened_at timestamp with time zone default now() not null, closed_at timestamp with time zone, notes text);

create table public.categories (id uuid default gen_random_uuid() not null, store_id uuid not null, name text not null, description text, parent_id uuid, status record_status default 'active'::record_status not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.customers (id uuid default gen_random_uuid() not null, store_id uuid not null, name text not null, phone_e164 text, email text, tax_number text, address text, notes text, status record_status default 'active'::record_status not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.expenses (id uuid default gen_random_uuid() not null, store_id uuid not null, description text not null, category text, amount numeric(14,2) not null, currency_code character(3) default 'AOA'::bpchar not null, incurred_at timestamp with time zone default now() not null, payment_method payment_method, notes text, created_by uuid, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.inventory_locations (id uuid default gen_random_uuid() not null, store_id uuid not null, name text not null, is_default boolean default false not null, status record_status default 'active'::record_status not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.inventory_movements (id uuid default gen_random_uuid() not null, store_id uuid not null, product_id uuid not null, location_id uuid not null, movement_type stock_movement_type not null, quantity_delta numeric(14,3) not null, unit_cost numeric(14,2), reference_type text, reference_id uuid, notes text, created_by uuid, created_at timestamp with time zone default now() not null);

create table public.payments (id uuid default gen_random_uuid() not null, store_id uuid not null, sale_id uuid not null, method payment_method not null, status payment_status default 'pending'::payment_status not null, amount numeric(14,2) not null, currency_code character(3) default 'AOA'::bpchar not null, external_reference text, paid_at timestamp with time zone, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.products (id uuid default gen_random_uuid() not null, store_id uuid not null, category_id uuid, sku text, barcode text, name text not null, description text, unit text default 'un'::text not null, sale_price numeric(14,2) default 0 not null, cost_price numeric(14,2) default 0 not null, track_stock boolean default true not null, min_stock numeric(14,3) default 0 not null, status record_status default 'active'::record_status not null, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.proxypay_payments (id uuid default gen_random_uuid() not null, store_id uuid not null, payment_id uuid not null, provider_flow text not null, entity_id text, reference_number text, proxypay_payment_id text, amount_aoa numeric(14,2) not null, fee numeric(14,2) default 0 not null, expiry_date date, status payment_status default 'pending'::payment_status not null, provider_payload jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.sale_items (id uuid default gen_random_uuid() not null, store_id uuid not null, sale_id uuid not null, product_id uuid, product_name text not null, sku text, quantity numeric(14,3) not null, unit_price numeric(14,2) not null, discount_amount numeric(14,2) default 0 not null, tax_rate numeric(6,3) default 0 not null, line_total numeric(14,2) not null, created_at timestamp with time zone default now() not null);

create table public.sales (id uuid default gen_random_uuid() not null, store_id uuid not null, sale_number bigint generated by default as identity not null, customer_id uuid, status sale_status default 'draft'::sale_status not null, subtotal numeric(14,2) default 0 not null, discount_total numeric(14,2) default 0 not null, tax_total numeric(14,2) default 0 not null, total numeric(14,2) default 0 not null, notes text, sold_at timestamp with time zone, created_by uuid, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.store_memberships (id uuid default gen_random_uuid() not null, store_id uuid not null, user_id uuid not null, role store_role default 'employee'::store_role not null, status record_status default 'active'::record_status not null, invited_by uuid, joined_at timestamp with time zone, created_at timestamp with time zone default now() not null);

create table public.stores (id uuid default gen_random_uuid() not null, name text not null, legal_name text, tax_number text, phone_e164 text, email text, address text, province_id uuid, municipality_id uuid, currency_code character(3) default 'AOA'::bpchar not null, timezone text default 'Africa/Luanda'::text not null, locale text default 'pt-AO'::text not null, settings jsonb default '{}'::jsonb not null, created_by uuid not null, status record_status default 'active'::record_status not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.suppliers (id uuid default gen_random_uuid() not null, store_id uuid not null, name text not null, phone_e164 text, email text, tax_number text, address text, notes text, status record_status default 'active'::record_status not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.user_profiles (id uuid not null, full_name text, phone_e164 text, preferred_locale text default 'pt-AO'::text not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.webhook_events (id uuid default gen_random_uuid() not null, source text not null, external_event_id text not null, signature_valid boolean default false not null, status text default 'received'::text not null, payload jsonb not null, received_at timestamp with time zone default now() not null, processed_at timestamp with time zone, attempts integer default 0 not null, last_error text);

create table public.whatsapp_connections (id uuid default gen_random_uuid() not null, store_id uuid not null, provider text default 'baileys'::text not null, phone_e164 text, connection_status text default 'disconnected'::text not null, last_connected_at timestamp with time zone, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.whatsapp_conversations (id uuid default gen_random_uuid() not null, store_id uuid not null, customer_id uuid, wa_contact text not null, contact_name text, last_message_at timestamp with time zone, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

create table public.whatsapp_messages (id uuid default gen_random_uuid() not null, store_id uuid not null, conversation_id uuid not null, external_message_id text, direction text not null, message_type text default 'text'::text not null, body text, media_storage_path text, delivery_status text default 'received'::text not null, sent_at timestamp with time zone, created_at timestamp with time zone default now() not null);

alter table public.ai_usage_logs add constraint ai_usage_logs_pkey PRIMARY KEY (id);

alter table public.ai_usage_logs add constraint ai_usage_logs_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;

alter table public.angola_municipalities add constraint angola_municipalities_code_key UNIQUE (code);

alter table public.angola_municipalities add constraint angola_municipalities_pkey PRIMARY KEY (id);

alter table public.angola_municipalities add constraint angola_municipalities_province_id_fkey FOREIGN KEY (province_id) REFERENCES angola_provinces(id) ON DELETE RESTRICT;

alter table public.angola_municipalities add constraint angola_municipalities_province_id_name_key UNIQUE (province_id, name);

alter table public.angola_provinces add constraint angola_provinces_code_key UNIQUE (code);

alter table public.angola_provinces add constraint angola_provinces_name_key UNIQUE (name);

alter table public.angola_provinces add constraint angola_provinces_pkey PRIMARY KEY (id);

alter table public.audit_logs add constraint audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);

alter table public.audit_logs add constraint audit_logs_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;

alter table public.automations add constraint automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.automations add constraint automations_pkey PRIMARY KEY (id);

alter table public.automations add constraint automations_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.automations add constraint automations_store_id_id_key UNIQUE (store_id, id);

alter table public.baileys_auth_state add constraint baileys_auth_state_pkey PRIMARY KEY (id);

alter table public.baileys_auth_state add constraint baileys_auth_state_store_id_connection_id_fkey FOREIGN KEY (store_id, connection_id) REFERENCES whatsapp_connections(store_id, id) ON DELETE CASCADE;

alter table public.baileys_auth_state add constraint baileys_auth_state_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.baileys_auth_state add constraint baileys_auth_state_store_id_session_id_key_type_key_id_key UNIQUE (store_id, session_id, key_type, key_id);

alter table public.cash_movements add constraint cash_movements_amount_check CHECK (amount > 0::numeric);

alter table public.cash_movements add constraint cash_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.cash_movements add constraint cash_movements_direction_check CHECK (direction = ANY (ARRAY['in'::text, 'out'::text]));

alter table public.cash_movements add constraint cash_movements_movement_type_check CHECK (movement_type = ANY (ARRAY['sale'::text, 'payment_in'::text, 'expense'::text, 'withdrawal'::text, 'deposit'::text, 'adjustment'::text]));

alter table public.cash_movements add constraint cash_movements_pkey PRIMARY KEY (id);

alter table public.cash_movements add constraint cash_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.cash_movements add constraint cash_movements_store_id_session_id_fkey FOREIGN KEY (store_id, session_id) REFERENCES cash_sessions(store_id, id) ON DELETE RESTRICT;

alter table public.cash_registers add constraint cash_registers_pkey PRIMARY KEY (id);

alter table public.cash_registers add constraint cash_registers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.cash_registers add constraint cash_registers_store_id_id_key UNIQUE (store_id, id);

alter table public.cash_registers add constraint cash_registers_store_id_location_id_fkey FOREIGN KEY (store_id, location_id) REFERENCES inventory_locations(store_id, id) ON DELETE RESTRICT;

alter table public.cash_sessions add constraint cash_sessions_check CHECK (closed_at IS NULL AND closing_amount IS NULL OR closed_at IS NOT NULL AND closing_amount IS NOT NULL);

alter table public.cash_sessions add constraint cash_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id);

alter table public.cash_sessions add constraint cash_sessions_closing_amount_check CHECK (closing_amount IS NULL OR closing_amount >= 0::numeric);

alter table public.cash_sessions add constraint cash_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);

alter table public.cash_sessions add constraint cash_sessions_opening_amount_check CHECK (opening_amount >= 0::numeric);

alter table public.cash_sessions add constraint cash_sessions_pkey PRIMARY KEY (id);

alter table public.cash_sessions add constraint cash_sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.cash_sessions add constraint cash_sessions_store_id_id_key UNIQUE (store_id, id);

alter table public.cash_sessions add constraint cash_sessions_store_id_register_id_fkey FOREIGN KEY (store_id, register_id) REFERENCES cash_registers(store_id, id) ON DELETE RESTRICT;

alter table public.categories add constraint categories_name_check CHECK (length(TRIM(BOTH FROM name)) >= 1 AND length(TRIM(BOTH FROM name)) <= 120);

alter table public.categories add constraint categories_pkey PRIMARY KEY (id);

alter table public.categories add constraint categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.categories add constraint categories_store_id_id_key UNIQUE (store_id, id);

alter table public.categories add constraint categories_store_id_name_key UNIQUE (store_id, name);

alter table public.categories add constraint categories_store_id_parent_id_fkey FOREIGN KEY (store_id, parent_id) REFERENCES categories(store_id, id) ON DELETE RESTRICT;

alter table public.customers add constraint customers_pkey PRIMARY KEY (id);

alter table public.customers add constraint customers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.customers add constraint customers_store_id_id_key UNIQUE (store_id, id);

alter table public.expenses add constraint expenses_amount_check CHECK (amount > 0::numeric);

alter table public.expenses add constraint expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.expenses add constraint expenses_currency_code_check CHECK (currency_code = 'AOA'::bpchar);

alter table public.expenses add constraint expenses_pkey PRIMARY KEY (id);

alter table public.expenses add constraint expenses_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.expenses add constraint expenses_store_id_id_key UNIQUE (store_id, id);

alter table public.inventory_locations add constraint inventory_locations_pkey PRIMARY KEY (id);

alter table public.inventory_locations add constraint inventory_locations_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.inventory_locations add constraint inventory_locations_store_id_id_key UNIQUE (store_id, id);

alter table public.inventory_locations add constraint inventory_locations_store_id_name_key UNIQUE (store_id, name);

alter table public.inventory_movements add constraint inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.inventory_movements add constraint inventory_movements_pkey PRIMARY KEY (id);

alter table public.inventory_movements add constraint inventory_movements_quantity_delta_check CHECK (quantity_delta <> 0::numeric);

alter table public.inventory_movements add constraint inventory_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.inventory_movements add constraint inventory_movements_store_id_location_id_fkey FOREIGN KEY (store_id, location_id) REFERENCES inventory_locations(store_id, id) ON DELETE RESTRICT;

alter table public.inventory_movements add constraint inventory_movements_store_id_product_id_fkey FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT;

alter table public.inventory_movements add constraint inventory_movements_unit_cost_check CHECK (unit_cost IS NULL OR unit_cost >= 0::numeric);

alter table public.payments add constraint payments_amount_check CHECK (amount > 0::numeric);

alter table public.payments add constraint payments_currency_code_check CHECK (currency_code = 'AOA'::bpchar);

alter table public.payments add constraint payments_pkey PRIMARY KEY (id);

alter table public.payments add constraint payments_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.payments add constraint payments_store_id_id_key UNIQUE (store_id, id);

alter table public.payments add constraint payments_store_id_sale_id_fkey FOREIGN KEY (store_id, sale_id) REFERENCES sales(store_id, id) ON DELETE RESTRICT;

alter table public.products add constraint products_cost_price_check CHECK (cost_price >= 0::numeric);

alter table public.products add constraint products_min_stock_check CHECK (min_stock >= 0::numeric);

alter table public.products add constraint products_name_check CHECK (length(TRIM(BOTH FROM name)) >= 1 AND length(TRIM(BOTH FROM name)) <= 180);

alter table public.products add constraint products_pkey PRIMARY KEY (id);

alter table public.products add constraint products_sale_price_check CHECK (sale_price >= 0::numeric);

alter table public.products add constraint products_store_id_category_id_fkey FOREIGN KEY (store_id, category_id) REFERENCES categories(store_id, id) ON DELETE RESTRICT;

alter table public.products add constraint products_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.products add constraint products_store_id_id_key UNIQUE (store_id, id);

alter table public.proxypay_payments add constraint proxypay_payments_amount_aoa_check CHECK (amount_aoa > 0::numeric);

alter table public.proxypay_payments add constraint proxypay_payments_entity_id_check CHECK (entity_id IS NULL OR entity_id ~ '^[0-9]{5}$'::text);

alter table public.proxypay_payments add constraint proxypay_payments_fee_check CHECK (fee >= 0::numeric);

alter table public.proxypay_payments add constraint proxypay_payments_pkey PRIMARY KEY (id);

alter table public.proxypay_payments add constraint proxypay_payments_provider_flow_check CHECK (provider_flow = ANY (ARRAY['reference_v2'::text, 'opg_v1'::text]));

alter table public.proxypay_payments add constraint proxypay_payments_proxypay_payment_id_key UNIQUE (proxypay_payment_id);

alter table public.proxypay_payments add constraint proxypay_payments_reference_number_check CHECK (reference_number IS NULL OR reference_number ~ '^[0-9]{9}$'::text);

alter table public.proxypay_payments add constraint proxypay_payments_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.proxypay_payments add constraint proxypay_payments_store_id_payment_id_fkey FOREIGN KEY (store_id, payment_id) REFERENCES payments(store_id, id) ON DELETE RESTRICT;

alter table public.sale_items add constraint sale_items_discount_amount_check CHECK (discount_amount >= 0::numeric);

alter table public.sale_items add constraint sale_items_line_total_check CHECK (line_total >= 0::numeric);

alter table public.sale_items add constraint sale_items_pkey PRIMARY KEY (id);

alter table public.sale_items add constraint sale_items_quantity_check CHECK (quantity > 0::numeric);

alter table public.sale_items add constraint sale_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.sale_items add constraint sale_items_store_id_product_id_fkey FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT;

alter table public.sale_items add constraint sale_items_store_id_sale_id_fkey FOREIGN KEY (store_id, sale_id) REFERENCES sales(store_id, id) ON DELETE CASCADE;

alter table public.sale_items add constraint sale_items_tax_rate_check CHECK (tax_rate >= 0::numeric);

alter table public.sale_items add constraint sale_items_unit_price_check CHECK (unit_price >= 0::numeric);

alter table public.sales add constraint sales_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.sales add constraint sales_discount_total_check CHECK (discount_total >= 0::numeric);

alter table public.sales add constraint sales_pkey PRIMARY KEY (id);

alter table public.sales add constraint sales_store_id_customer_id_fkey FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT;

alter table public.sales add constraint sales_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.sales add constraint sales_store_id_id_key UNIQUE (store_id, id);

alter table public.sales add constraint sales_store_id_sale_number_key UNIQUE (store_id, sale_number);

alter table public.sales add constraint sales_subtotal_check CHECK (subtotal >= 0::numeric);

alter table public.sales add constraint sales_tax_total_check CHECK (tax_total >= 0::numeric);

alter table public.sales add constraint sales_total_check CHECK (total >= 0::numeric);

alter table public.store_memberships add constraint store_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.store_memberships add constraint store_memberships_pkey PRIMARY KEY (id);

alter table public.store_memberships add constraint store_memberships_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.store_memberships add constraint store_memberships_store_id_id_key UNIQUE (store_id, id);

alter table public.store_memberships add constraint store_memberships_store_id_user_id_key UNIQUE (store_id, user_id);

alter table public.store_memberships add constraint store_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.stores add constraint stores_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.stores add constraint stores_currency_code_check CHECK (currency_code = 'AOA'::bpchar);

alter table public.stores add constraint stores_municipality_fk FOREIGN KEY (municipality_id) REFERENCES angola_municipalities(id) ON DELETE SET NULL;

alter table public.stores add constraint stores_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 160);

alter table public.stores add constraint stores_pkey PRIMARY KEY (id);

alter table public.stores add constraint stores_province_fk FOREIGN KEY (province_id) REFERENCES angola_provinces(id) ON DELETE SET NULL;

alter table public.suppliers add constraint suppliers_pkey PRIMARY KEY (id);

alter table public.suppliers add constraint suppliers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.suppliers add constraint suppliers_store_id_id_key UNIQUE (store_id, id);

alter table public.user_profiles add constraint user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.user_profiles add constraint user_profiles_pkey PRIMARY KEY (id);

alter table public.webhook_events add constraint webhook_events_attempts_check CHECK (attempts >= 0);

alter table public.webhook_events add constraint webhook_events_pkey PRIMARY KEY (id);

alter table public.webhook_events add constraint webhook_events_source_external_event_id_key UNIQUE (source, external_event_id);

alter table public.webhook_events add constraint webhook_events_status_check CHECK (status = ANY (ARRAY['received'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'ignored'::text]));

alter table public.whatsapp_connections add constraint whatsapp_connections_connection_status_check CHECK (connection_status = ANY (ARRAY['disconnected'::text, 'connecting'::text, 'qr_pending'::text, 'connected'::text, 'logged_out'::text, 'error'::text]));

alter table public.whatsapp_connections add constraint whatsapp_connections_pkey PRIMARY KEY (id);

alter table public.whatsapp_connections add constraint whatsapp_connections_provider_check CHECK (provider = ANY (ARRAY['baileys'::text, 'cloud_api'::text]));

alter table public.whatsapp_connections add constraint whatsapp_connections_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.whatsapp_connections add constraint whatsapp_connections_store_id_id_key UNIQUE (store_id, id);

alter table public.whatsapp_connections add constraint whatsapp_connections_store_id_key UNIQUE (store_id);

alter table public.whatsapp_conversations add constraint whatsapp_conversations_pkey PRIMARY KEY (id);

alter table public.whatsapp_conversations add constraint whatsapp_conversations_store_id_customer_id_fkey FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT;

alter table public.whatsapp_conversations add constraint whatsapp_conversations_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

alter table public.whatsapp_conversations add constraint whatsapp_conversations_store_id_id_key UNIQUE (store_id, id);

alter table public.whatsapp_messages add constraint whatsapp_messages_direction_check CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text]));

alter table public.whatsapp_messages add constraint whatsapp_messages_pkey PRIMARY KEY (id);

alter table public.whatsapp_messages add constraint whatsapp_messages_store_id_conversation_id_fkey FOREIGN KEY (store_id, conversation_id) REFERENCES whatsapp_conversations(store_id, id) ON DELETE CASCADE;

alter table public.whatsapp_messages add constraint whatsapp_messages_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

CREATE INDEX ai_usage_logs_store_idx ON public.ai_usage_logs USING btree (store_id);

CREATE INDEX ai_usage_provider_date_idx ON public.ai_usage_logs USING btree (provider, created_at DESC);

CREATE INDEX angola_municipalities_province_idx ON public.angola_municipalities USING btree (province_id);

CREATE INDEX audit_logs_actor_idx ON public.audit_logs USING btree (actor_user_id);

CREATE INDEX audit_logs_store_date_idx ON public.audit_logs USING btree (store_id, created_at DESC);

CREATE INDEX automations_created_by_idx ON public.automations USING btree (created_by);

CREATE INDEX baileys_auth_state_connection_idx ON public.baileys_auth_state USING btree (store_id, connection_id);

CREATE INDEX cash_movements_created_by_idx ON public.cash_movements USING btree (created_by);

CREATE INDEX cash_movements_session_idx ON public.cash_movements USING btree (store_id, session_id, created_at);

CREATE UNIQUE INDEX cash_one_open_session_per_register ON public.cash_sessions USING btree (store_id, register_id) WHERE (closed_at IS NULL);

CREATE INDEX cash_registers_location_fk_idx ON public.cash_registers USING btree (store_id, location_id);

CREATE INDEX cash_sessions_closed_by_idx ON public.cash_sessions USING btree (closed_by);

CREATE INDEX cash_sessions_opened_by_idx ON public.cash_sessions USING btree (opened_by);

CREATE INDEX categories_parent_fk_idx ON public.categories USING btree (store_id, parent_id);

CREATE INDEX customers_store_name_idx ON public.customers USING btree (store_id, lower(name));

CREATE INDEX customers_store_phone_idx ON public.customers USING btree (store_id, phone_e164) WHERE (phone_e164 IS NOT NULL);

CREATE INDEX expenses_created_by_idx ON public.expenses USING btree (created_by);

CREATE INDEX expenses_store_date_idx ON public.expenses USING btree (store_id, incurred_at DESC);

CREATE INDEX inventory_movements_created_by_idx ON public.inventory_movements USING btree (created_by);

CREATE INDEX inventory_movements_location_fk_idx ON public.inventory_movements USING btree (store_id, location_id);

CREATE INDEX inventory_movements_product_date_idx ON public.inventory_movements USING btree (store_id, product_id, created_at DESC);

CREATE UNIQUE INDEX inventory_one_default_per_store ON public.inventory_locations USING btree (store_id) WHERE is_default;

CREATE INDEX memberships_invited_by_idx ON public.store_memberships USING btree (invited_by);

CREATE UNIQUE INDEX payments_external_reference_uq ON public.payments USING btree (method, external_reference) WHERE (external_reference IS NOT NULL);

CREATE INDEX payments_sale_idx ON public.payments USING btree (store_id, sale_id, created_at DESC);

CREATE INDEX products_category_fk_idx ON public.products USING btree (store_id, category_id);

CREATE UNIQUE INDEX products_store_barcode_uq ON public.products USING btree (store_id, barcode) WHERE (barcode IS NOT NULL);

CREATE INDEX products_store_name_idx ON public.products USING btree (store_id, lower(name));

CREATE UNIQUE INDEX products_store_sku_uq ON public.products USING btree (store_id, lower(sku)) WHERE (sku IS NOT NULL);

CREATE INDEX proxypay_payments_payment_fk_idx ON public.proxypay_payments USING btree (store_id, payment_id);

CREATE INDEX proxypay_payments_store_status_idx ON public.proxypay_payments USING btree (store_id, status);

CREATE INDEX sale_items_product_fk_idx ON public.sale_items USING btree (store_id, product_id);

CREATE INDEX sale_items_sale_idx ON public.sale_items USING btree (store_id, sale_id);

CREATE INDEX sales_created_by_idx ON public.sales USING btree (created_by);

CREATE INDEX sales_customer_fk_idx ON public.sales USING btree (store_id, customer_id);

CREATE INDEX sales_store_date_idx ON public.sales USING btree (store_id, created_at DESC);

CREATE INDEX sales_store_status_idx ON public.sales USING btree (store_id, status, created_at DESC);

CREATE INDEX store_memberships_user_idx ON public.store_memberships USING btree (user_id, status);

CREATE INDEX stores_created_by_idx ON public.stores USING btree (created_by);

CREATE INDEX stores_municipality_fk_idx ON public.stores USING btree (municipality_id);

CREATE INDEX stores_province_fk_idx ON public.stores USING btree (province_id);

CREATE INDEX webhook_events_status_date_idx ON public.webhook_events USING btree (status, received_at);

CREATE INDEX whatsapp_conversations_contact_idx ON public.whatsapp_conversations USING btree (store_id, wa_contact);

CREATE INDEX whatsapp_conversations_customer_fk_idx ON public.whatsapp_conversations USING btree (store_id, customer_id);

CREATE UNIQUE INDEX whatsapp_external_message_uq ON public.whatsapp_messages USING btree (store_id, external_message_id) WHERE (external_message_id IS NOT NULL);

CREATE INDEX whatsapp_messages_conversation_date_idx ON public.whatsapp_messages USING btree (store_id, conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select exists(select 1 from public.store_memberships m where m.store_id=p_store_id and m.user_id=(select auth.uid()) and m.status='active'); $function$


CREATE OR REPLACE FUNCTION public.has_store_role(p_store_id uuid, p_roles store_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select exists(select 1 from public.store_memberships m where m.store_id=p_store_id and m.user_id=(select auth.uid()) and m.status='active' and m.role=any(p_roles)); $function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin new.updated_at=now(); return new; end; $function$


alter table public.ai_usage_logs enable row level security;

alter table public.angola_municipalities enable row level security;

alter table public.angola_provinces enable row level security;

alter table public.audit_logs enable row level security;

alter table public.automations enable row level security;

alter table public.baileys_auth_state enable row level security;

alter table public.cash_movements enable row level security;

alter table public.cash_registers enable row level security;

alter table public.cash_sessions enable row level security;

alter table public.categories enable row level security;

alter table public.customers enable row level security;

alter table public.expenses enable row level security;

alter table public.inventory_locations enable row level security;

alter table public.inventory_movements enable row level security;

alter table public.payments enable row level security;

alter table public.products enable row level security;

alter table public.proxypay_payments enable row level security;

alter table public.sale_items enable row level security;

alter table public.sales enable row level security;

alter table public.store_memberships enable row level security;

alter table public.stores enable row level security;

alter table public.suppliers enable row level security;

alter table public.user_profiles enable row level security;

alter table public.webhook_events enable row level security;

alter table public.whatsapp_connections enable row level security;

alter table public.whatsapp_conversations enable row level security;

alter table public.whatsapp_messages enable row level security;

create policy ai_usage_logs_backend_only on public.ai_usage_logs as PERMISSIVE for ALL to anon, authenticated using (false) with check (false);

create policy municipalities_read on public.angola_municipalities as PERMISSIVE for SELECT to authenticated using (true);

create policy provinces_read on public.angola_provinces as PERMISSIVE for SELECT to authenticated using (true);

create policy audit_logs_backend_only on public.audit_logs as PERMISSIVE for ALL to anon, authenticated using (false) with check (false);

create policy automations_delete_admin on public.automations as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role]));

create policy automations_insert_manager on public.automations as PERMISSIVE for INSERT to authenticated with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy automations_read_member on public.automations as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy automations_update_manager on public.automations as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy baileys_auth_state_backend_only on public.baileys_auth_state as PERMISSIVE for ALL to anon, authenticated using (false) with check (false);

create policy cash_movements_delete_admin on public.cash_movements as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role]));

create policy cash_movements_insert_member on public.cash_movements as PERMISSIVE for INSERT to authenticated with check ((has_store_access(store_id) AND (created_by = ( SELECT auth.uid() AS uid))));

create policy cash_movements_read_member on public.cash_movements as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy cash_movements_update_admin on public.cash_movements as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role]));

create policy cash_registers_delete_manager on public.cash_registers as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy cash_registers_insert_manager on public.cash_registers as PERMISSIVE for INSERT to authenticated with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy cash_registers_read_member on public.cash_registers as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy cash_registers_update_manager on public.cash_registers as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy cash_sessions_insert_member on public.cash_sessions as PERMISSIVE for INSERT to authenticated with check ((has_store_access(store_id) AND (opened_by = ( SELECT auth.uid() AS uid))));

create policy cash_sessions_read_member on public.cash_sessions as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy cash_sessions_update_manager on public.cash_sessions as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy categories_delete_admin on public.categories as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role]));

create policy categories_insert_manager on public.categories as PERMISSIVE for INSERT to authenticated with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy categories_read_member on public.categories as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy categories_update_manager on public.categories as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy customers_delete_manager on public.customers as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy customers_insert_member on public.customers as PERMISSIVE for INSERT to authenticated with check (has_store_access(store_id));

create policy customers_read_member on public.customers as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy customers_update_member on public.customers as PERMISSIVE for UPDATE to authenticated using (has_store_access(store_id)) with check (has_store_access(store_id));

create policy expenses_delete_admin on public.expenses as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role]));

create policy expenses_insert_manager on public.expenses as PERMISSIVE for INSERT to authenticated with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy expenses_read_member on public.expenses as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy expenses_update_manager on public.expenses as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy inventory_locations_delete_manager on public.inventory_locations as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy inventory_locations_insert_manager on public.inventory_locations as PERMISSIVE for INSERT to authenticated with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy inventory_locations_read_member on public.inventory_locations as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy inventory_locations_update_manager on public.inventory_locations as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy inventory_movements_read_member on public.inventory_movements as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy payments_read_member on public.payments as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy products_delete_admin on public.products as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role]));

create policy products_insert_manager on public.products as PERMISSIVE for INSERT to authenticated with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy products_read_member on public.products as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy products_update_manager on public.products as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy proxypay_read_manager on public.proxypay_payments as PERMISSIVE for SELECT to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy sale_items_delete_manager on public.sale_items as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy sale_items_insert_member on public.sale_items as PERMISSIVE for INSERT to authenticated with check (has_store_access(store_id));

create policy sale_items_read_member on public.sale_items as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy sale_items_update_manager on public.sale_items as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy sales_delete_admin on public.sales as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role]));

create policy sales_insert_member on public.sales as PERMISSIVE for INSERT to authenticated with check (has_store_access(store_id));

create policy sales_read_member on public.sales as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy sales_update_manager on public.sales as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy memberships_delete_owner on public.store_memberships as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role]));

create policy memberships_insert_owner on public.store_memberships as PERMISSIVE for INSERT to authenticated with check ((((user_id = ( SELECT auth.uid() AS uid)) AND (role = 'owner'::store_role) AND (EXISTS ( SELECT 1
   FROM stores s
  WHERE ((s.id = store_memberships.store_id) AND (s.created_by = ( SELECT auth.uid() AS uid)))))) OR (has_store_role(store_id, ARRAY['owner'::store_role]) AND (role <> 'owner'::store_role))));

create policy memberships_select_self on public.store_memberships as PERMISSIVE for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

create policy memberships_update_owner on public.store_memberships as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role]));

create policy stores_insert_creator on public.stores as PERMISSIVE for INSERT to authenticated with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy stores_select_member_or_creator on public.stores as PERMISSIVE for SELECT to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR has_store_access(id)));

create policy stores_update_admin on public.stores as PERMISSIVE for UPDATE to authenticated using (has_store_role(id, ARRAY['owner'::store_role, 'admin'::store_role])) with check (((created_by = ( SELECT auth.uid() AS uid)) AND has_store_role(id, ARRAY['owner'::store_role, 'admin'::store_role])));

create policy suppliers_delete_manager on public.suppliers as PERMISSIVE for DELETE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy suppliers_insert_manager on public.suppliers as PERMISSIVE for INSERT to authenticated with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy suppliers_read_member on public.suppliers as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy suppliers_update_manager on public.suppliers as PERMISSIVE for UPDATE to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role])) with check (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy profile_insert_own on public.user_profiles as PERMISSIVE for INSERT to authenticated with check ((id = ( SELECT auth.uid() AS uid)));

create policy profile_select_own on public.user_profiles as PERMISSIVE for SELECT to authenticated using ((id = ( SELECT auth.uid() AS uid)));

create policy profile_update_own on public.user_profiles as PERMISSIVE for UPDATE to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));

create policy webhook_events_backend_only on public.webhook_events as PERMISSIVE for ALL to anon, authenticated using (false) with check (false);

create policy whatsapp_connections_read_manager on public.whatsapp_connections as PERMISSIVE for SELECT to authenticated using (has_store_role(store_id, ARRAY['owner'::store_role, 'admin'::store_role, 'manager'::store_role]));

create policy whatsapp_conversations_read_member on public.whatsapp_conversations as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

create policy whatsapp_messages_read_member on public.whatsapp_messages as PERMISSIVE for SELECT to authenticated using (has_store_access(store_id));

CREATE TRIGGER automations_set_updated_at BEFORE UPDATE ON automations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cash_registers_set_updated_at BEFORE UPDATE ON cash_registers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER inventory_locations_set_updated_at BEFORE UPDATE ON inventory_locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sales_set_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER stores_set_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_profiles_set_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER whatsapp_connections_set_updated_at BEFORE UPDATE ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER whatsapp_conversations_set_updated_at BEFORE UPDATE ON whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

create view public.inventory_balances with (security_invoker=true) as  SELECT store_id,
    product_id,
    location_id,
    sum(quantity_delta)::numeric(14,3) AS quantity_on_hand
   FROM inventory_movements
  GROUP BY store_id, product_id, location_id;;

grant DELETE on table public.ai_usage_logs to service_role;

grant INSERT on table public.ai_usage_logs to service_role;

grant REFERENCES on table public.ai_usage_logs to service_role;

grant SELECT on table public.ai_usage_logs to service_role;

grant TRIGGER on table public.ai_usage_logs to service_role;

grant TRUNCATE on table public.ai_usage_logs to service_role;

grant UPDATE on table public.ai_usage_logs to service_role;

grant SELECT on table public.angola_municipalities to authenticated;

grant DELETE on table public.angola_municipalities to service_role;

grant INSERT on table public.angola_municipalities to service_role;

grant REFERENCES on table public.angola_municipalities to service_role;

grant SELECT on table public.angola_municipalities to service_role;

grant TRIGGER on table public.angola_municipalities to service_role;

grant TRUNCATE on table public.angola_municipalities to service_role;

grant UPDATE on table public.angola_municipalities to service_role;

grant SELECT on table public.angola_provinces to authenticated;

grant DELETE on table public.angola_provinces to service_role;

grant INSERT on table public.angola_provinces to service_role;

grant REFERENCES on table public.angola_provinces to service_role;

grant SELECT on table public.angola_provinces to service_role;

grant TRIGGER on table public.angola_provinces to service_role;

grant TRUNCATE on table public.angola_provinces to service_role;

grant UPDATE on table public.angola_provinces to service_role;

grant DELETE on table public.audit_logs to service_role;

grant INSERT on table public.audit_logs to service_role;

grant REFERENCES on table public.audit_logs to service_role;

grant SELECT on table public.audit_logs to service_role;

grant TRIGGER on table public.audit_logs to service_role;

grant TRUNCATE on table public.audit_logs to service_role;

grant UPDATE on table public.audit_logs to service_role;

grant DELETE on table public.automations to authenticated;

grant INSERT on table public.automations to authenticated;

grant SELECT on table public.automations to authenticated;

grant UPDATE on table public.automations to authenticated;

grant DELETE on table public.automations to service_role;

grant INSERT on table public.automations to service_role;

grant REFERENCES on table public.automations to service_role;

grant SELECT on table public.automations to service_role;

grant TRIGGER on table public.automations to service_role;

grant TRUNCATE on table public.automations to service_role;

grant UPDATE on table public.automations to service_role;

grant DELETE on table public.baileys_auth_state to service_role;

grant INSERT on table public.baileys_auth_state to service_role;

grant REFERENCES on table public.baileys_auth_state to service_role;

grant SELECT on table public.baileys_auth_state to service_role;

grant TRIGGER on table public.baileys_auth_state to service_role;

grant TRUNCATE on table public.baileys_auth_state to service_role;

grant UPDATE on table public.baileys_auth_state to service_role;

grant DELETE on table public.cash_movements to authenticated;

grant INSERT on table public.cash_movements to authenticated;

grant SELECT on table public.cash_movements to authenticated;

grant UPDATE on table public.cash_movements to authenticated;

grant DELETE on table public.cash_movements to service_role;

grant INSERT on table public.cash_movements to service_role;

grant REFERENCES on table public.cash_movements to service_role;

grant SELECT on table public.cash_movements to service_role;

grant TRIGGER on table public.cash_movements to service_role;

grant TRUNCATE on table public.cash_movements to service_role;

grant UPDATE on table public.cash_movements to service_role;

grant DELETE on table public.cash_registers to authenticated;

grant INSERT on table public.cash_registers to authenticated;

grant SELECT on table public.cash_registers to authenticated;

grant UPDATE on table public.cash_registers to authenticated;

grant DELETE on table public.cash_registers to service_role;

grant INSERT on table public.cash_registers to service_role;

grant REFERENCES on table public.cash_registers to service_role;

grant SELECT on table public.cash_registers to service_role;

grant TRIGGER on table public.cash_registers to service_role;

grant TRUNCATE on table public.cash_registers to service_role;

grant UPDATE on table public.cash_registers to service_role;

grant DELETE on table public.cash_sessions to authenticated;

grant INSERT on table public.cash_sessions to authenticated;

grant SELECT on table public.cash_sessions to authenticated;

grant UPDATE on table public.cash_sessions to authenticated;

grant DELETE on table public.cash_sessions to service_role;

grant INSERT on table public.cash_sessions to service_role;

grant REFERENCES on table public.cash_sessions to service_role;

grant SELECT on table public.cash_sessions to service_role;

grant TRIGGER on table public.cash_sessions to service_role;

grant TRUNCATE on table public.cash_sessions to service_role;

grant UPDATE on table public.cash_sessions to service_role;

grant DELETE on table public.categories to authenticated;

grant INSERT on table public.categories to authenticated;

grant SELECT on table public.categories to authenticated;

grant UPDATE on table public.categories to authenticated;

grant DELETE on table public.categories to service_role;

grant INSERT on table public.categories to service_role;

grant REFERENCES on table public.categories to service_role;

grant SELECT on table public.categories to service_role;

grant TRIGGER on table public.categories to service_role;

grant TRUNCATE on table public.categories to service_role;

grant UPDATE on table public.categories to service_role;

grant DELETE on table public.customers to authenticated;

grant INSERT on table public.customers to authenticated;

grant SELECT on table public.customers to authenticated;

grant UPDATE on table public.customers to authenticated;

grant DELETE on table public.customers to service_role;

grant INSERT on table public.customers to service_role;

grant REFERENCES on table public.customers to service_role;

grant SELECT on table public.customers to service_role;

grant TRIGGER on table public.customers to service_role;

grant TRUNCATE on table public.customers to service_role;

grant UPDATE on table public.customers to service_role;

grant DELETE on table public.expenses to authenticated;

grant INSERT on table public.expenses to authenticated;

grant SELECT on table public.expenses to authenticated;

grant UPDATE on table public.expenses to authenticated;

grant DELETE on table public.expenses to service_role;

grant INSERT on table public.expenses to service_role;

grant REFERENCES on table public.expenses to service_role;

grant SELECT on table public.expenses to service_role;

grant TRIGGER on table public.expenses to service_role;

grant TRUNCATE on table public.expenses to service_role;

grant UPDATE on table public.expenses to service_role;

grant SELECT on table public.inventory_balances to authenticated;

grant DELETE on table public.inventory_balances to service_role;

grant INSERT on table public.inventory_balances to service_role;

grant REFERENCES on table public.inventory_balances to service_role;

grant SELECT on table public.inventory_balances to service_role;

grant TRIGGER on table public.inventory_balances to service_role;

grant TRUNCATE on table public.inventory_balances to service_role;

grant UPDATE on table public.inventory_balances to service_role;

grant DELETE on table public.inventory_locations to authenticated;

grant INSERT on table public.inventory_locations to authenticated;

grant SELECT on table public.inventory_locations to authenticated;

grant UPDATE on table public.inventory_locations to authenticated;

grant DELETE on table public.inventory_locations to service_role;

grant INSERT on table public.inventory_locations to service_role;

grant REFERENCES on table public.inventory_locations to service_role;

grant SELECT on table public.inventory_locations to service_role;

grant TRIGGER on table public.inventory_locations to service_role;

grant TRUNCATE on table public.inventory_locations to service_role;

grant UPDATE on table public.inventory_locations to service_role;

grant SELECT on table public.inventory_movements to authenticated;

grant DELETE on table public.inventory_movements to service_role;

grant INSERT on table public.inventory_movements to service_role;

grant REFERENCES on table public.inventory_movements to service_role;

grant SELECT on table public.inventory_movements to service_role;

grant TRIGGER on table public.inventory_movements to service_role;

grant TRUNCATE on table public.inventory_movements to service_role;

grant UPDATE on table public.inventory_movements to service_role;

grant SELECT on table public.payments to authenticated;

grant DELETE on table public.payments to service_role;

grant INSERT on table public.payments to service_role;

grant REFERENCES on table public.payments to service_role;

grant SELECT on table public.payments to service_role;

grant TRIGGER on table public.payments to service_role;

grant TRUNCATE on table public.payments to service_role;

grant UPDATE on table public.payments to service_role;

grant DELETE on table public.products to authenticated;

grant INSERT on table public.products to authenticated;

grant SELECT on table public.products to authenticated;

grant UPDATE on table public.products to authenticated;

grant DELETE on table public.products to service_role;

grant INSERT on table public.products to service_role;

grant REFERENCES on table public.products to service_role;

grant SELECT on table public.products to service_role;

grant TRIGGER on table public.products to service_role;

grant TRUNCATE on table public.products to service_role;

grant UPDATE on table public.products to service_role;

grant SELECT on table public.proxypay_payments to authenticated;

grant DELETE on table public.proxypay_payments to service_role;

grant INSERT on table public.proxypay_payments to service_role;

grant REFERENCES on table public.proxypay_payments to service_role;

grant SELECT on table public.proxypay_payments to service_role;

grant TRIGGER on table public.proxypay_payments to service_role;

grant TRUNCATE on table public.proxypay_payments to service_role;

grant UPDATE on table public.proxypay_payments to service_role;

grant DELETE on table public.sale_items to authenticated;

grant INSERT on table public.sale_items to authenticated;

grant SELECT on table public.sale_items to authenticated;

grant UPDATE on table public.sale_items to authenticated;

grant DELETE on table public.sale_items to service_role;

grant INSERT on table public.sale_items to service_role;

grant REFERENCES on table public.sale_items to service_role;

grant SELECT on table public.sale_items to service_role;

grant TRIGGER on table public.sale_items to service_role;

grant TRUNCATE on table public.sale_items to service_role;

grant UPDATE on table public.sale_items to service_role;

grant DELETE on table public.sales to authenticated;

grant INSERT on table public.sales to authenticated;

grant SELECT on table public.sales to authenticated;

grant UPDATE on table public.sales to authenticated;

grant DELETE on table public.sales to service_role;

grant INSERT on table public.sales to service_role;

grant REFERENCES on table public.sales to service_role;

grant SELECT on table public.sales to service_role;

grant TRIGGER on table public.sales to service_role;

grant TRUNCATE on table public.sales to service_role;

grant UPDATE on table public.sales to service_role;

grant DELETE on table public.store_memberships to authenticated;

grant INSERT on table public.store_memberships to authenticated;

grant SELECT on table public.store_memberships to authenticated;

grant UPDATE on table public.store_memberships to authenticated;

grant DELETE on table public.store_memberships to service_role;

grant INSERT on table public.store_memberships to service_role;

grant REFERENCES on table public.store_memberships to service_role;

grant SELECT on table public.store_memberships to service_role;

grant TRIGGER on table public.store_memberships to service_role;

grant TRUNCATE on table public.store_memberships to service_role;

grant UPDATE on table public.store_memberships to service_role;

grant INSERT on table public.stores to authenticated;

grant SELECT on table public.stores to authenticated;

grant UPDATE on table public.stores to authenticated;

grant DELETE on table public.stores to service_role;

grant INSERT on table public.stores to service_role;

grant REFERENCES on table public.stores to service_role;

grant SELECT on table public.stores to service_role;

grant TRIGGER on table public.stores to service_role;

grant TRUNCATE on table public.stores to service_role;

grant UPDATE on table public.stores to service_role;

grant DELETE on table public.suppliers to authenticated;

grant INSERT on table public.suppliers to authenticated;

grant SELECT on table public.suppliers to authenticated;

grant UPDATE on table public.suppliers to authenticated;

grant DELETE on table public.suppliers to service_role;

grant INSERT on table public.suppliers to service_role;

grant REFERENCES on table public.suppliers to service_role;

grant SELECT on table public.suppliers to service_role;

grant TRIGGER on table public.suppliers to service_role;

grant TRUNCATE on table public.suppliers to service_role;

grant UPDATE on table public.suppliers to service_role;

grant INSERT on table public.user_profiles to authenticated;

grant SELECT on table public.user_profiles to authenticated;

grant UPDATE on table public.user_profiles to authenticated;

grant DELETE on table public.user_profiles to service_role;

grant INSERT on table public.user_profiles to service_role;

grant REFERENCES on table public.user_profiles to service_role;

grant SELECT on table public.user_profiles to service_role;

grant TRIGGER on table public.user_profiles to service_role;

grant TRUNCATE on table public.user_profiles to service_role;

grant UPDATE on table public.user_profiles to service_role;

grant DELETE on table public.webhook_events to service_role;

grant INSERT on table public.webhook_events to service_role;

grant REFERENCES on table public.webhook_events to service_role;

grant SELECT on table public.webhook_events to service_role;

grant TRIGGER on table public.webhook_events to service_role;

grant TRUNCATE on table public.webhook_events to service_role;

grant UPDATE on table public.webhook_events to service_role;

grant SELECT on table public.whatsapp_connections to authenticated;

grant DELETE on table public.whatsapp_connections to service_role;

grant INSERT on table public.whatsapp_connections to service_role;

grant REFERENCES on table public.whatsapp_connections to service_role;

grant SELECT on table public.whatsapp_connections to service_role;

grant TRIGGER on table public.whatsapp_connections to service_role;

grant TRUNCATE on table public.whatsapp_connections to service_role;

grant UPDATE on table public.whatsapp_connections to service_role;

grant DELETE on table public.whatsapp_conversations to authenticated;

grant INSERT on table public.whatsapp_conversations to authenticated;

grant SELECT on table public.whatsapp_conversations to authenticated;

grant UPDATE on table public.whatsapp_conversations to authenticated;

grant DELETE on table public.whatsapp_conversations to service_role;

grant INSERT on table public.whatsapp_conversations to service_role;

grant REFERENCES on table public.whatsapp_conversations to service_role;

grant SELECT on table public.whatsapp_conversations to service_role;

grant TRIGGER on table public.whatsapp_conversations to service_role;

grant TRUNCATE on table public.whatsapp_conversations to service_role;

grant UPDATE on table public.whatsapp_conversations to service_role;

grant SELECT on table public.whatsapp_messages to authenticated;

grant DELETE on table public.whatsapp_messages to service_role;

grant INSERT on table public.whatsapp_messages to service_role;

grant REFERENCES on table public.whatsapp_messages to service_role;

grant SELECT on table public.whatsapp_messages to service_role;

grant TRIGGER on table public.whatsapp_messages to service_role;

grant TRUNCATE on table public.whatsapp_messages to service_role;

grant UPDATE on table public.whatsapp_messages to service_role;

grant execute on function public.has_store_access(uuid) to authenticated, service_role;
grant execute on function public.has_store_role(uuid, public.store_role[]) to authenticated, service_role;
