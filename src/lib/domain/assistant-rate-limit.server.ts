import "server-only";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import type {AssistantRateLimiter} from "./assistant-orchestration";
import {InMemoryTenantRateLimiter} from "./assistant-rate-limit";

const globalRateLimiter = globalThis as unknown as {
  __edvaniaDistributedRateLimiter?: InMemoryTenantRateLimiter;
};

export const DAILY_AI_STORE_BUDGET = 500;

export function getSharedAssistantRateLimiter(): AssistantRateLimiter {
  if (!globalRateLimiter.__edvaniaDistributedRateLimiter) {
    globalRateLimiter.__edvaniaDistributedRateLimiter = new InMemoryTenantRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 20,
      maxDailyPerStore: DAILY_AI_STORE_BUDGET,
    });
  }
  const memoryLimiter = globalRateLimiter.__edvaniaDistributedRateLimiter;

  return {
    async allow(tenantId: string, userId: string): Promise<boolean> {
      const withinWindow = await memoryLimiter.allow(tenantId, userId);
      if (!withinWindow) return false;

      const admin = getSupabaseAdminClient();
      if (!admin) return true;

      try {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const {count, error} = await admin
          .from("ai_usage_logs")
          .select("id", {count: "exact", head: true})
          .eq("store_id", tenantId)
          .gte("created_at", dayStart.toISOString());
        if (error) return true;
        return (count ?? 0) < DAILY_AI_STORE_BUDGET;
      } catch {
        return true;
      }
    },
  };
}
