-- Additive hardening migration based on docs/AUDITORIA_PRONTIDAO_WHATSAPP_SEM_CUSTOS_2026-11-22.md:
-- 1. Index missing foreign key public.purchases(created_by)
-- 2. Enforce max 10-minute confirmation window in SQL
-- 3. Enforce write-once semantics on save_assistant_confirmation_result

CREATE INDEX IF NOT EXISTS purchases_created_by_idx
  ON public.purchases (created_by);

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
  IF p_expires_at <= now() OR p_expires_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'confirmation_expiration_out_of_bounds';
  END IF;

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
    AND status = 'consumed'
    AND result_json IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.create_assistant_confirmation(text, uuid, uuid, uuid, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_assistant_confirmation(text, uuid, uuid, uuid, text, text, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.save_assistant_confirmation_result(text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_assistant_confirmation_result(text, uuid, uuid, uuid, text, jsonb) TO service_role;
