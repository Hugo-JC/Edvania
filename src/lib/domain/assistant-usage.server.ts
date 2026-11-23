import "server-only";
import {randomUUID} from "node:crypto";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import {getMockDb} from "@/lib/supabase/mock";

export async function recordAiUsageLog(input: Readonly<{
  storeId: string;
  provider: string;
  model: string;
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  taskType?: string;
}>): Promise<void> {
  const entry = {
    store_id: input.storeId,
    provider: input.provider.slice(0, 60),
    model: input.model.slice(0, 100),
    success: input.success,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    status_code: input.statusCode ?? null,
    task_type: input.taskType ?? "assistant_turn",
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    const db = getMockDb();
    db.ai_usage_logs.push({
      id: randomUUID(),
      ...entry,
      created_at: new Date().toISOString(),
    });
    return;
  }

  try {
    await admin.from("ai_usage_logs").insert(entry);
  } catch {
    // Usage logging must never leak secrets or break user-facing assistant responses.
  }
}

export async function getTodayAiUsageCount(storeId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const cutoff = dayStart.toISOString();

  const admin = getSupabaseAdminClient();
  if (!admin) {
    const db = getMockDb();
    return db.ai_usage_logs.filter(
      (row) => row.store_id === storeId && String(row.created_at ?? "") >= cutoff,
    ).length;
  }

  try {
    const {count} = await admin
      .from("ai_usage_logs")
      .select("id", {count: "exact", head: true})
      .eq("store_id", storeId)
      .gte("created_at", cutoff);
    return count ?? 0;
  } catch {
    return 0;
  }
}
