"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const money = z.coerce.number().finite().min(0).refine((value) => Math.round(value * 100) === value * 100, "invalid amount");

async function callCashRpc(
  run: (supabase: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message: string } | null }>,
  storeId: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await run(supabase);
  if (error) redirect(`/cash?store=${storeId}&error=operation-failed`);
  redirect(`/cash?store=${storeId}&saved=1`);
}

export async function openCashSession(formData: FormData) {
  const parsed = z.object({ storeId: uuid, registerId: uuid, openingAmount: money, notes: z.string().trim().max(500).optional(), idempotencyKey: uuid }).safeParse({
    storeId: formData.get("storeId"), registerId: formData.get("registerId"), openingAmount: formData.get("openingAmount"), notes: formData.get("notes"), idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-cash-session");
  await callCashRpc((supabase) => supabase.rpc("open_cash_session_with_audit", {
    p_store_id: parsed.data.storeId,
    p_register_id: parsed.data.registerId,
    p_opening_amount: parsed.data.openingAmount,
    p_notes: parsed.data.notes || undefined,
    p_idempotency_key: parsed.data.idempotencyKey,
  }), parsed.data.storeId);
}

export async function recordCashMovement(formData: FormData) {
  const parsed = z.object({ storeId: uuid, sessionId: uuid, type: z.enum(["deposit", "withdrawal", "adjustment"]), direction: z.enum(["in", "out"]), amount: money.refine((value) => value > 0), description: z.string().trim().min(1).max(500), idempotencyKey: uuid }).safeParse({
    storeId: formData.get("storeId"), sessionId: formData.get("sessionId"), type: formData.get("type"), direction: formData.get("direction"), amount: formData.get("amount"), description: formData.get("description"), idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-cash-movement");
  await callCashRpc((supabase) => supabase.rpc("record_cash_movement_with_audit", {
    p_store_id: parsed.data.storeId,
    p_session_id: parsed.data.sessionId,
    p_movement_type: parsed.data.type,
    p_direction: parsed.data.direction,
    p_amount: parsed.data.amount,
    p_description: parsed.data.description,
    p_idempotency_key: parsed.data.idempotencyKey,
  }), parsed.data.storeId);
}

export async function closeCashSession(formData: FormData) {
  const parsed = z.object({ storeId: uuid, sessionId: uuid, countedAmount: money, notes: z.string().trim().max(500).optional(), idempotencyKey: uuid }).safeParse({ storeId: formData.get("storeId"), sessionId: formData.get("sessionId"), countedAmount: formData.get("countedAmount"), notes: formData.get("notes"), idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) redirect("/dashboard?error=invalid-cash-close");
  await callCashRpc((supabase) => supabase.rpc("close_cash_session_with_audit", {
    p_store_id: parsed.data.storeId,
    p_session_id: parsed.data.sessionId,
    p_counted_amount: parsed.data.countedAmount,
    p_notes: parsed.data.notes || undefined,
    p_idempotency_key: parsed.data.idempotencyKey,
  }), parsed.data.storeId);
}
