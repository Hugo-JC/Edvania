import test from "node:test";
import assert from "node:assert/strict";
import {dispatchOutboxMessage, OutboxLeaseLostError} from "./outbox.ts";
import {WhatsAppSendError} from "./provider.ts";

const claim = {
  id: "33333333-3333-4333-8333-333333333333",
  tenantId: "11111111-1111-4111-8111-111111111111",
  connectionId: "22222222-2222-4222-8222-222222222222",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
  recipient: "244923456789@s.whatsapp.net",
  body: "Confirmação de teste",
  status: "sending",
  attempts: 1,
  maxAttempts: 4,
  leaseOwner: "worker-test",
  leaseToken: "55555555-5555-4555-8555-555555555555",
};

function createStore() {
  const updates = [];
  return {
    updates,
    async finalize(currentClaim, update) {
      updates.push({currentClaim, update});
      return true;
    },
  };
}

test("dispatch finalizes a successful send using the claimed tenant and lease", async () => {
  const store = createStore();
  const sendCalls = [];
  const result = await dispatchOutboxMessage(claim, {
    async send(...args) {
      sendCalls.push(args);
      return {providerMessageId: "provider-1"};
    },
  }, store);

  assert.equal(result.status, "sent");
  assert.equal(sendCalls[0][0], claim.tenantId);
  assert.equal(sendCalls[0][1], claim.connectionId);
  assert.equal(sendCalls[0][4], claim.idempotencyKey);
  assert.equal(store.updates[0].currentClaim.leaseToken, claim.leaseToken);
});

test("ambiguous provider errors become unknown and are never retried", async () => {
  const store = createStore();
  const result = await dispatchOutboxMessage(claim, {
    async send() {
      throw new WhatsAppSendError("timeout", true, true);
    },
  }, store);

  assert.deepEqual(result, {status: "unknown", errorCode: "timeout"});
});

test("definite transient failures use bounded backoff and retry limit", async () => {
  const store = createStore();
  const result = await dispatchOutboxMessage(claim, {
    async send() {
      throw new WhatsAppSendError("rate_limited", true, false);
    },
  }, store, {now: () => 1_700_000_000_000, random: () => 1, retryBaseMs: 1_000, retryMaxMs: 10_000});

  assert.deepEqual(result, {
    status: "retry_wait",
    errorCode: "rate_limited",
    availableAt: new Date(1_700_000_001_000).toISOString(),
  });

  const exhausted = await dispatchOutboxMessage({...claim, attempts: 4}, {
    async send() {
      throw new WhatsAppSendError("rejected", true, false);
    },
  }, createStore());
  assert.deepEqual(exhausted, {status: "failed", errorCode: "rejected"});
});

test("lost lease is surfaced and invalid claims are rejected before send", async () => {
  let sends = 0;
  await assert.rejects(() => dispatchOutboxMessage(claim, {
    async send() {
      sends += 1;
      return {providerMessageId: "provider-1"};
    },
  }, {async finalize() { return false; }}), OutboxLeaseLostError);

  await assert.rejects(() => dispatchOutboxMessage({...claim, tenantId: "tenant-a"}, {
    async send() {
      sends += 1;
      return {providerMessageId: "provider-1"};
    },
  }, createStore()), RangeError);
  assert.equal(sends, 1);
});
