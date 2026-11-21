import test from "node:test";
import assert from "node:assert/strict";
import {createWhatsAppOutboxStore, WhatsAppOutboxStoreError} from "./outbox-store.ts";

const storeId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const outboxId = "33333333-3333-4333-8333-333333333333";
const leaseToken = "44444444-4444-4444-8444-444444444444";

function outboxRow(overrides = {}) {
  return {
    id: outboxId,
    store_id: storeId,
    connection_id: connectionId,
    conversation_id: "55555555-5555-4555-8555-555555555555",
    idempotency_key: "66666666-6666-4666-8666-666666666666",
    recipient: "15550000001@s.whatsapp.net",
    body: "test",
    status: "sending",
    attempts: 2,
    available_at: "2026-11-21T00:00:00.000Z",
    lease_owner: "worker-a",
    lease_token: leaseToken,
    lease_expires_at: "2026-11-21T00:01:00.000Z",
    provider_message_id: null,
    last_error: null,
    created_at: "2026-11-21T00:00:00.000Z",
    updated_at: "2026-11-21T00:00:00.000Z",
    ...overrides,
  };
}

test("claim passes explicit store scope and maps only sending rows to dispatcher claims", async () => {
  let receivedArgs;
  const store = createWhatsAppOutboxStore({
    async claim(args) {
      receivedArgs = args;
      return {data: [outboxRow()], error: null};
    },
    async finalize() {
      return {data: true, error: null};
    },
  });

  const claims = await store.claim(storeId, "worker-a", 5, 30);
  assert.deepEqual(receivedArgs, {
    p_store_id: storeId,
    p_lease_owner: "worker-a",
    p_limit: 5,
    p_lease_seconds: 30,
  });
  assert.deepEqual(claims[0], {
    id: outboxId,
    tenantId: storeId,
    connectionId,
    idempotencyKey: "66666666-6666-4666-8666-666666666666",
    recipient: "15550000001@s.whatsapp.net",
    body: "test",
    status: "sending",
    attempts: 2,
    maxAttempts: 20,
    leaseOwner: "worker-a",
    leaseToken,
  });
});

test("finalization forwards tenant and lease fencing and bounds retry delay", async () => {
  let receivedArgs;
  const store = createWhatsAppOutboxStore({
    async claim() {
      return {data: [], error: null};
    },
    async finalize(args) {
      receivedArgs = args;
      return {data: true, error: null};
    },
  }, () => Date.parse("2026-11-21T00:00:00.000Z"));

  const result = await store.finalize({
    id: outboxId,
    tenantId: storeId,
    connectionId,
    idempotencyKey: "66666666-6666-4666-8666-666666666666",
    recipient: "15550000001@s.whatsapp.net",
    body: "test",
    status: "sending",
    attempts: 2,
    maxAttempts: 20,
    leaseOwner: "worker-a",
    leaseToken,
  }, {status: "retry_wait", errorCode: "temporary_failure", availableAt: "2026-11-21T00:00:10.000Z"});

  assert.equal(result, true);
  assert.deepEqual(receivedArgs, {
    p_store_id: storeId,
    p_outbox_id: outboxId,
    p_lease_token: leaseToken,
    p_outcome: "retry",
    p_provider_message_id: null,
    p_retry_seconds: 10,
    p_error_code: "temporary_failure",
  });
});

test("database errors, invalid claims, and unsafe retry metadata remain explicit failures", async () => {
  const failedClaimStore = createWhatsAppOutboxStore({
    async claim() {
      return {data: null, error: {message: "db failure"}};
    },
    async finalize() {
      return {data: false, error: null};
    },
  });
  await assert.rejects(failedClaimStore.claim(storeId, "worker-a"), WhatsAppOutboxStoreError);

  const invalidClaimStore = createWhatsAppOutboxStore({
    async claim() {
      return {data: [outboxRow({status: "queued"})], error: null};
    },
    async finalize() {
      return {data: false, error: null};
    },
  });
  await assert.rejects(invalidClaimStore.claim(storeId, "worker-a"), {message: "claim_invalid_result"});

  const store = createWhatsAppOutboxStore({
    async claim() {
      return {data: [], error: null};
    },
    async finalize() {
      return {data: false, error: null};
    },
  });
  await assert.rejects(store.finalize({
    id: outboxId,
    tenantId: storeId,
    connectionId,
    idempotencyKey: "66666666-6666-4666-8666-666666666666",
    recipient: "15550000001@s.whatsapp.net",
    body: "test",
    status: "sending",
    attempts: 1,
    maxAttempts: 20,
    leaseOwner: "worker-a",
    leaseToken,
  }, {status: "retry_wait", errorCode: "secret=must_not_pass", availableAt: "2026-11-21T00:00:10.000Z"}), {
    message: "invalid_error_code",
  });
});
