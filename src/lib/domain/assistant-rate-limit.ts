import type {AssistantRateLimiter} from "./assistant-orchestration.ts";

type WindowBucket = {
  timestamps: number[];
};

type DailyBucket = {
  dayKey: string;
  count: number;
};

export type TenantRateLimiterOptions = Readonly<{
  windowMs?: number;
  maxPerWindow?: number;
  maxDailyPerStore?: number;
  now?: () => number;
}>;

export class InMemoryTenantRateLimiter implements AssistantRateLimiter {
  private readonly userBuckets = new Map<string, WindowBucket>();
  private readonly storeDaily = new Map<string, DailyBucket>();
  private readonly windowMs: number;
  private readonly maxPerWindow: number;
  private readonly maxDailyPerStore: number;
  private readonly now: () => number;

  constructor(options: TenantRateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.maxPerWindow = options.maxPerWindow ?? 10;
    this.maxDailyPerStore = options.maxDailyPerStore ?? 500;
    this.now = options.now ?? Date.now;
    if (!Number.isInteger(this.windowMs) || this.windowMs < 1_000) throw new RangeError("Invalid rate limit window.");
    if (!Number.isInteger(this.maxPerWindow) || this.maxPerWindow < 1) throw new RangeError("Invalid window limit.");
    if (!Number.isInteger(this.maxDailyPerStore) || this.maxDailyPerStore < 1) throw new RangeError("Invalid daily store budget.");
  }

  async allow(tenantId: string, userId: string): Promise<boolean> {
    if (!tenantId.trim() || !userId.trim()) return false;
    const nowMs = this.now();
    const cutoff = nowMs - this.windowMs;
    const userKey = `${tenantId}:${userId}`;
    const bucket = this.userBuckets.get(userKey) ?? {timestamps: []};
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
    if (bucket.timestamps.length >= this.maxPerWindow) {
      this.userBuckets.set(userKey, bucket);
      return false;
    }

    const dayKey = new Date(nowMs).toISOString().slice(0, 10);
    const storeBucket = this.storeDaily.get(tenantId);
    const currentDailyCount = storeBucket && storeBucket.dayKey === dayKey ? storeBucket.count : 0;
    if (currentDailyCount >= this.maxDailyPerStore) {
      return false;
    }

    bucket.timestamps.push(nowMs);
    this.userBuckets.set(userKey, bucket);
    this.storeDaily.set(tenantId, {dayKey, count: currentDailyCount + 1});
    return true;
  }
}
