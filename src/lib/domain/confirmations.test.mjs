import test from "node:test";
import assert from "node:assert/strict";
import {ConfirmationError, confirmOperation, prepareOperationConfirmation} from "./confirmations.ts";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  conversationId: "33333333-3333-4333-8333-333333333333",
};
const payload = {
  items: [{productId: "44444444-4444-4444-8444-444444444444", quantity: 2}],
  paymentMethod: "cash",
  paidAmount: 20,
};

function createStore() {
  const pending = new Map();
  return {
    pending,
    async createPending(record) {
      pending.set(record.tokenHash, record);
    },
    async consumePending(input) {
      const record = pending.get(input.tokenHash);
      if (!record
        || record.tenantId !== input.tenantId
        || record.userId !== input.userId
        || record.conversationId !== input.conversationId
        || record.operation !== input.operation
        || record.fingerprint !== input.fingerprint
        || Date.parse(record.expiresAt) <= Date.parse(input.now)) return null;
      pending.delete(input.tokenHash);
      return record.idempotencyKey;
    },
  };
}

function createPreviewer() {
  return async (_context, operation, input) => ({
    summary: `${operation}: ${input.items?.[0]?.quantity ?? 0} item(s)`,
    fingerprintData: {quantity: input.items?.[0]?.quantity, total: (input.items?.[0]?.quantity ?? 0) * 10},
  });
}

test("confirmation is bound to the previewed intent and executes with server idempotency key", async () => {
  const store = createStore();
  const previewer = createPreviewer();
  const prepared = await prepareOperationConfirmation(context, "create_sale", payload, previewer, store, {
    now: () => 10_000,
    ttlMs: 60_000,
  });
  let executed;
  const result = await confirmOperation(context, "create_sale", payload, prepared.token, previewer, store, async (...args) => {
    executed = args;
    return {ok: true, data: {saleId: "sale-1"}};
  }, 20_000);

  assert.equal(prepared.summary, "create_sale: 2 item(s)");
  assert.equal(prepared.expiresAt, new Date(70_000).toISOString());
  assert.equal(store.pending.size, 0);
  assert.equal(executed[0], context);
  assert.equal(executed[1], "create_sale");
  assert.match(executed[3], /^[0-9a-f-]{36}$/i);
  assert.equal(result.ok, true);
});

test("altered payload or previewed price cannot consume a confirmation", async () => {
  const store = createStore();
  const previewer = createPreviewer();
  const prepared = await prepareOperationConfirmation(context, "create_sale", payload, previewer, store, {now: () => 10_000});
  let executed = false;

  await assert.rejects(() => confirmOperation(context, "create_sale", {
    ...payload,
    items: [{...payload.items[0], quantity: 3}],
  }, prepared.token, previewer, store, async () => {
    executed = true;
    return {ok: true, data: {}};
  }, 20_000), ConfirmationError);

  const changedPricePreview = async () => ({
    summary: "create_sale: price changed",
    fingerprintData: {quantity: 2, total: 99},
  });
  await assert.rejects(() => confirmOperation(context, "create_sale", payload, prepared.token, changedPricePreview, store, async () => {
    executed = true;
    return {ok: true, data: {}};
  }, 20_000), ConfirmationError);
  assert.equal(executed, false);
});

test("confirmation expires, is context-bound, and executes at most once", async () => {
  const previewer = createPreviewer();
  const expiredStore = createStore();
  const expired = await prepareOperationConfirmation(context, "create_sale", payload, previewer, expiredStore, {
    now: () => 10_000,
    ttlMs: 1_000,
  });
  await assert.rejects(() => confirmOperation(context, "create_sale", payload, expired.token, previewer, expiredStore, async () => ({
    ok: true,
    data: {},
  }), 11_000), ConfirmationError);

  const store = createStore();
  const prepared = await prepareOperationConfirmation(context, "create_sale", payload, previewer, store, {now: () => 10_000});
  const otherContext = {...context, userId: "55555555-5555-4555-8555-555555555555"};
  await assert.rejects(() => confirmOperation(otherContext, "create_sale", payload, prepared.token, previewer, store, async () => ({
    ok: true,
    data: {},
  }), 20_000), ConfirmationError);

  let executions = 0;
  const execute = async () => {
    executions += 1;
    return {ok: true, data: {}};
  };
  const attempts = await Promise.allSettled([
    confirmOperation(context, "create_sale", payload, prepared.token, previewer, store, execute, 20_000),
    confirmOperation(context, "create_sale", payload, prepared.token, previewer, store, execute, 20_000),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
  assert.equal(executions, 1);
});

test("malformed operation payloads and unallowlisted operations do not create pending records", async () => {
  const store = createStore();
  await assert.rejects(() => prepareOperationConfirmation(context, "delete_store", {}, createPreviewer(), store), ConfirmationError);
  await assert.rejects(() => prepareOperationConfirmation(context, "create_sale", {...payload, injected: true}, createPreviewer(), store), ConfirmationError);
  assert.equal(store.pending.size, 0);
});
