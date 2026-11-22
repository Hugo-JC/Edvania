-- Local incremental migration for Meta H durable multi-instance confirmations.
-- Pending PostgreSQL/Supabase disposable validation; NOT applied remotely.

CREATE TABLE IF NOT EXISTS public.assistant_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  operation text NOT NULL CHECK (
    operation IN (
      'create_sale',
      'create_purchase',
      'open_cash_session',
      'close_cash_session',
      'register_expense'
    )
  ),
  fingerprint text NOT NULL,
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed')),
  result_json jsonb NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_confirmations_store_expires_idx
  ON public.assistant_confirmations (store_id, expires_at);

ALTER TABLE public.assistant_confirmations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.assistant_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_confirmations TO service_role;

CREATE OR REPLACE FUNCTION public.create_assistant_confirmation(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text,
  p_fingerprint text,
  p_idempotency_key uuid,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.assistant_confirmations (
    token_hash,
    store_id,
    user_id,
    conversation_id,
    operation,
    fingerprint,
    idempotency_key,
    expires_at
  )
  VALUES (
    p_token_hash,
    p_store_id,
    p_user_id,
    p_conversation_id,
    p_operation,
    p_fingerprint,
    p_idempotency_key,
    p_expires_at
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_assistant_confirmation(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text,
  p_fingerprint text,
  p_now timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idempotency_key uuid;
BEGIN
  UPDATE public.assistant_confirmations
  SET status = 'consumed',
      consumed_at = p_now
  WHERE token_hash = p_token_hash
    AND store_id = p_store_id
    AND user_id = p_user_id
    AND conversation_id = p_conversation_id
    AND operation = p_operation
    AND fingerprint = p_fingerprint
    AND status = 'pending'
    AND expires_at > p_now
  RETURNING idempotency_key INTO v_idempotency_key;

  RETURN v_idempotency_key;
END;
$$;

REVOKE ALL ON FUNCTION public.create_assistant_confirmation(text, uuid, uuid, uuid, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_assistant_confirmation(text, uuid, uuid, uuid, text, text, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.consume_assistant_confirmation(text, uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assistant_confirmation(text, uuid, uuid, uuid, text, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.save_assistant_confirmation_result(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text,
  p_result_json jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.assistant_confirmations
  SET result_json = p_result_json
  WHERE token_hash = p_token_hash
    AND store_id = p_store_id
    AND user_id = p_user_id
    AND conversation_id = p_conversation_id
    AND operation = p_operation
    AND status = 'consumed';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_assistant_confirmation_result(
  p_token_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_operation text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT result_json
  FROM public.assistant_confirmations
  WHERE token_hash = p_token_hash
    AND store_id = p_store_id
    AND user_id = p_user_id
    AND conversation_id = p_conversation_id
    AND operation = p_operation
    AND status = 'consumed'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.save_assistant_confirmation_result(text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_assistant_confirmation_result(text, uuid, uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.get_assistant_confirmation_result(text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_assistant_confirmation_result(text, uuid, uuid, uuid, text) TO service_role;

