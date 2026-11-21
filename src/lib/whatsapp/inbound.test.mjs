import test from "node:test";
import assert from "node:assert/strict";
import {InboundMessageError, ingestInboundMessage, normalizeInboundMessage} from "./inbound.ts";

const input = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  connectionId: "22222222-2222-4222-8222-222222222222",
  senderId: "244923456789@s.whatsapp.net",
  isFromMe: false,
  isBroadcast: false,
  contactName: "  Ana  ",
  providerMessageId: "provider-message-1",
  messageType: "text",
  body: "  Olá, preciso de ajuda. ",
  receivedAtMs: 1_700_000_000_000,
};

test("normalizes inbound text with tenant scope and stable idempotency key", () => {
  const normalized = normalizeInboundMessage(input, input.receivedAtMs);

  assert.deepEqual(normalized, {
    tenantId: input.tenantId,
    connectionId: input.connectionId,
    senderId: input.senderId,
    contactName: "Ana",
    providerMessageId: input.providerMessageId,
    idempotencyKey: input.providerMessageId,
    messageType: "text",
    body: input.body,
    receivedAt: new Date(input.receivedAtMs).toISOString(),
  });
});

test("rejects malformed, oversized, future, and group input", () => {
  assert.throws(() => normalizeInboundMessage({...input, tenantId: "store-1"}), InboundMessageError);
  assert.throws(() => normalizeInboundMessage({...input, body: "x".repeat(4097)}), InboundMessageError);
  assert.throws(() => normalizeInboundMessage({...input, receivedAtMs: 1_700_000_301_000}, 1_700_000_000_000), InboundMessageError);
  assert.throws(() => normalizeInboundMessage({...input, senderId: "123@g.us"}), InboundMessageError);
  assert.throws(() => normalizeInboundMessage({...input, senderId: "123@g.us:participant"}), InboundMessageError);
  assert.throws(() => normalizeInboundMessage({...input, senderId: "123@broadcast"}), InboundMessageError);
  assert.throws(() => normalizeInboundMessage({...input, isFromMe: true}), InboundMessageError);
  assert.throws(() => normalizeInboundMessage({...input, isBroadcast: true}), InboundMessageError);
});

test("rejects unsupported media rather than silently dropping content", () => {
  assert.throws(
    () => normalizeInboundMessage({...input, messageType: "image", body: null}),
    (error) => error instanceof InboundMessageError && error.code === "unsupported_message_type",
  );
});

test("ingress delegates only normalized data and propagates persistence failures", async () => {
  let stored;
  const result = await ingestInboundMessage(input, {
    async enqueueInbound(message) {
      stored = message;
      return {messageId: "message-1", jobId: "job-1", inserted: true};
    },
  }, input.receivedAtMs);

  assert.equal(stored.tenantId, input.tenantId);
  assert.equal(result.inserted, true);
  await assert.rejects(() => ingestInboundMessage(input, {
    async enqueueInbound() {
      throw new Error("storage_unavailable");
    },
  }, input.receivedAtMs), /storage_unavailable/);
});
