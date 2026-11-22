import test from "node:test";
import assert from "node:assert/strict";
import {createSessionBackedSender} from "./session-sender.ts";
import {WhatsAppSendError} from "./provider.ts";
import {WhatsAppSessionManager} from "./session-manager.ts";

const tenantId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";

test("session-backed sender rejects send when session is not connected", async () => {
  const manager = new WhatsAppSessionManager({
    async startConnection() {
      return {async disconnect() {}};
    },
  });
  let providerCalls = 0;
  const sender = createSessionBackedSender(manager, {
    async sendText() {
      providerCalls += 1;
      return {providerMessageId: "unexpected"};
    },
  });

  await assert.rejects(
    sender.send(tenantId, connectionId, "244900000001@s.whatsapp.net", "Olá", "33333333-3333-4333-8333-333333333333"),
    (error) => error instanceof WhatsAppSendError && error.code === "session_not_connected" && error.retryable && !error.deliveryUnknown,
  );
  assert.equal(providerCalls, 0);
});

test("session-backed sender forwards message only when tenant connection is connected", async () => {
  const manager = new WhatsAppSessionManager({
    async startConnection(_t, _c, callbacks) {
      callbacks.onOpen();
      return {async disconnect() {}};
    },
  });
  await manager.connect(tenantId, connectionId);

  const sent = [];
  const sender = createSessionBackedSender(manager, {
    async sendText(...args) {
      sent.push(args);
      return {providerMessageId: "msg-001"};
    },
  });

  const receipt = await sender.send(
    tenantId,
    connectionId,
    "244900000001@s.whatsapp.net",
    "Preço: 500 AOA",
    "33333333-3333-4333-8333-333333333333",
  );
  assert.deepEqual(receipt, {providerMessageId: "msg-001"});
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], tenantId);
  assert.equal(sent[0][1], connectionId);
});
