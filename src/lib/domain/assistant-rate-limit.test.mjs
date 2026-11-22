import test from "node:test";
import assert from "node:assert/strict";
import {InMemoryTenantRateLimiter} from "./assistant-rate-limit.ts";

test("rate limiter enforces sliding window per user and daily store budget independently across tenants", async () => {
  let currentMs = Date.parse("2026-11-21T10:00:00.000Z");
  const limiter = new InMemoryTenantRateLimiter({
    windowMs: 10_000,
    maxPerWindow: 2,
    maxDailyPerStore: 3,
    now: () => currentMs,
  });

  const storeA = "11111111-1111-4111-8111-111111111111";
  const storeB = "99999999-9999-4999-8999-999999999999";
  const user1 = "22222222-2222-4222-8222-222222222222";
  const user2 = "33333333-3333-4333-8333-333333333333";

  assert.equal(await limiter.allow(storeA, user1), true);
  assert.equal(await limiter.allow(storeA, user1), true);
  assert.equal(await limiter.allow(storeA, user1), false);
  assert.equal(await limiter.allow(storeB, user1), true);

  currentMs += 11_000;
  assert.equal(await limiter.allow(storeA, user2), true);
  assert.equal(await limiter.allow(storeA, user1), false);
});
