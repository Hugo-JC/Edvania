import test from "node:test";
import assert from "node:assert/strict";
import {dispatchOutboxBatch} from "./outbox-worker.ts";

const tenantId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";

function claim(id, attempt = 1) {
  return {
    id: `${id}3333333-3333-4333-8333-333333333333`,
    tenantId,
    connectionId,
    idempotencyKey: "44444444-4444-4444-8444-444444444444",
    recipient: "15550000001@s.whatsapp.net",
    body: "test",
    status: "sending",
    attempts: attempt,
    maxAttempts: 5,
    leaseOwner: "worker-a",
    leaseToken: "55555555-5555-4555-8555-555555555555",
  };
}

test("batch worker claims within bounds and dispatches claimed messages sequentially", async () => {
  const events = [];
  const claims = [claim("a"), claim("b", 2)];
  const result = await dispatchOutboxBatch(tenantId, "worker-a", {
    async claim(...args) {
      events.push(["claim", ...args]);
      return claims;
    },
    async finalize(current, update) {
      events.push(["finalize", current.id, update.status]);
      return true;
    },
  }, {
    async send(_tenant, _connection, _recipient, _body, key) {
      events.push(["send", key]);
      return {providerMessageId: `provider-${events.filter(([type]) => type === "send").length}`};
    },
  }, {limit: 2, leaseSeconds: 30});

  assert.equal(result.claimed, 2);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["sent", "sent"]);
  assert.deepEqual(events.map(([type]) => type), ["claim", "send", "finalize", "send", "finalize"]);
  assert.deepEqual(events[0], ["claim", tenantId, "worker-a", 2, 30]);
});

test("batch worker rejects invalid bounds or claims that escape tenant scope", async () => {
  const noOpStore = {
    async claim() { return []; },
    async finalize() { return true; },
  };
  await assert.rejects(dispatchOutboxBatch(tenantId, "worker-a", noOpStore, {async send() {
    return {providerMessageId: "unused"};
  }}, {limit: 101}), RangeError);

  await assert.rejects(dispatchOutboxBatch(tenantId, "worker-a", {
    async claim() { return [{...claim("a"), tenantId: "99999999-9999-4999-8999-999999999999"}]; },
    async finalize() { return true; },
  }, {async send() {
    throw new Error("must not send cross-tenant claim");
  }}), /tenant scope/);
});
