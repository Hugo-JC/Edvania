import "server-only";
import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import {getPublicEnv, isSupabaseConfigured} from "@/lib/env";
import type {Database} from "@/lib/supabase/database.types";

export async function recordAiUsageLog(input: Readonly<{
  storeId: string;
  provider: string;
  model: string;
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  taskType?: string;
}>): Promise<void> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SECRET_KEY?.trim()) {
    return;
  }
  try {
    const {url} = getPublicEnv();
    const client = createSupabaseClient<Database>(url, process.env.SUPABASE_SECRET_KEY.trim(), {
      auth: {autoRefreshToken: false, persistSession: false},
    });
    await client.from("ai_usage_logs").insert({
      store_id: input.storeId,
      provider: input.provider.slice(0, 60),
      model: input.model.slice(0, 100),
      success: input.success,
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      status_code: input.statusCode ?? null,
      task_type: input.taskType ?? "assistant_turn",
    });
  } catch {
    // Usage logging must never leak secrets or break user-facing assistant responses.
  }
}
