import test from "node:test";
import assert from "node:assert/strict";
import {confirmOperation, prepareOperationConfirmation} from "./confirmations.ts";
import {InMemoryConfirmationStore} from "./confirmations-store.ts";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  conversationId: "33333333-3333-4333-8333-333333333333",
};

const saleInput = {
  items: [{productId: "44444444-4444-4444-8444-444444444444", quantity: 2}],
  paymentMethod: "cash",
  paidAmount: 1000,
};

test("InMemoryConfirmationStore enforces atomic single-use consumption, context binding, and expiry pruning", async () => {
  const store = new InMemoryConfirmationStore();
  let now = Date.parse("2026-11-21T10:00:00.000Z");
  const preview = async () => ({summary: "Venda de 1 artigo · 1000 AOA", fingerprintData: {total: 1000}});

  const prepared = await prepareOperationConfirmation(context, "create_sale", saleInput, preview, store, {
    now: () => now,
    ttlMs: 60_000,
  });
  assert.equal(store.size, 1);

  const executedKeys = [];
  const executor = async (_ctx, _op, _payload, idempotencyKey) => {
    executedKeys.push(idempotencyKey);
    return {ok: true, data: {saleId: "55555555-5555-4555-8555-555555555555"}};
  };

  const [first, second] = await Promise.allSettled([
    confirmOperation(context, "create_sale", saleInput, prepared.token, preview, store, executor, now + 1000),
    confirmOperation(context, "create_sale", saleInput, prepared.token, preview, store, executor, now + 1000),
  ]);
  assert.equal([first, second].filter((r) => r.status === "fulfilled").length, 1);
  assert.equal([first, second].filter((r) => r.status === "rejected").length, 1);
  assert.equal(executedKeys.length, 1);
  assert.equal(store.size, 0);

  const expiring = await prepareOperationConfirmation(context, "create_sale", saleInput, preview, store, {
    now: () => now,
    ttlMs: 5_000,
  });
  now += 6_000;
  assert.equal(store.pruneExpired(new Date(now).toISOString()), 1);
  await assert.rejects(
    confirmOperation(context, "create_sale", saleInput, expiring.token, preview, store, executor, now),
    /invalid_confirmation/,
  );
});
