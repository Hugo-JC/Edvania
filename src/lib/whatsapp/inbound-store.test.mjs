import test from "node:test";
import assert from "node:assert/strict";
import {createWhatsAppInboundStore, WhatsAppInboundStoreError} from "./inbound-store.ts";

const message = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  connectionId: "22222222-2222-4222-8222-222222222222",
  senderId: "244923456789@s.whatsapp.net",
  contactName: "Ana",
  providerMessageId: "message-external-1",
  idempotencyKey: "message-external-1",
  messageType: "text",
  body: "Olá",
  receivedAt: "2026-11-21T10:00:00.000Z",
};

test("inbound RPC adapter passes normalized tenant-scoped data and maps the durable job result", async () => {
  let receivedArgs;
  const store = createWhatsAppInboundStore({
    async enqueue(args) {
      receivedArgs = args;
      return {data: [{message_id: "message-1", job_id: "job-1", inserted: true}], error: null};
    },
  });

  const result = await store.enqueueInbound(message);
  assert.deepEqual(receivedArgs, {
    p_store_id: message.tenantId,
    p_connection_id: message.connectionId,
    p_sender_id: message.senderId,
    p_contact_name: "Ana",
    p_external_message_id: message.providerMessageId,
    p_body: "Olá",
    p_received_at: message.receivedAt,
  });
  assert.deepEqual(result, {messageId: "message-1", jobId: "job-1", inserted: true});
});

test("database failures and malformed RPC results fail explicitly", async () => {
  const failedStore = createWhatsAppInboundStore({
    async enqueue() {
      return {data: null, error: {message: "database detail"}};
    },
  });
  await assert.rejects(failedStore.enqueueInbound(message), {message: "enqueue_failed"});

  const malformedStore = createWhatsAppInboundStore({
    async enqueue() {
      return {data: [{message_id: "message-1", job_id: "job-1", inserted: "yes"}], error: null};
    },
  });
  await assert.rejects(malformedStore.enqueueInbound(message), WhatsAppInboundStoreError);
});
