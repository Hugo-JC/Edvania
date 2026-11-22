import type {OutboundSender} from "./outbox.ts";
import {WhatsAppSendError, type WhatsAppMessageSender} from "./provider.ts";
import type {WhatsAppSessionManager} from "./session-manager.ts";

export function createSessionBackedSender(
  sessions: Pick<WhatsAppSessionManager, "getStatus">,
  provider: WhatsAppMessageSender,
): OutboundSender {
  return {
    async send(tenantId, connectionId, recipient, body, idempotencyKey) {
      const snapshot = sessions.getStatus(tenantId, connectionId);
      if (snapshot.status !== "connected") {
        throw new WhatsAppSendError("session_not_connected", true, false);
      }
      return provider.sendText(tenantId, connectionId, recipient, body, idempotencyKey);
    },
  };
}
