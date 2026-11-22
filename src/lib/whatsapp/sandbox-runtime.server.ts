import "server-only";
import {randomUUID} from "node:crypto";
import {runDomainAssistantTurn} from "@/lib/domain/assistant-orchestration.server";
import {resolveConfiguredAssistantProviders} from "@/lib/domain/assistant-providers.server";
import {InMemoryTenantRateLimiter} from "@/lib/domain/assistant-rate-limit";
import {getMockDb} from "@/lib/supabase/mock";
import {normalizeInboundMessage} from "./inbound";
import type {ClaimedOutboxMessage, OutboxFinalization} from "./outbox";
import {dispatchOutboxBatch, type ClaimableOutboxStore} from "./outbox-worker";
import {WhatsAppSendError, type ProviderCallbacks, type WhatsAppProvider} from "./provider";
import {WhatsAppSessionManager, type ConnectionSnapshot} from "./session-manager";
import {createSessionBackedSender} from "./session-sender";

type PendingSandboxSocket = {
  callbacks: ProviderCallbacks;
  connected: boolean;
};

class SandboxRuntime {
  readonly sessionManager: WhatsAppSessionManager;
  readonly rateLimiter: InMemoryTenantRateLimiter;
  private readonly sockets = new Map<string, PendingSandboxSocket>();
  private readonly provider: WhatsAppProvider;

  constructor() {
    this.provider = {
      startConnection: async (tenantId, connectionId, callbacks) => {
        const key = `${tenantId}:${connectionId}`;
        const socketState: PendingSandboxSocket = {callbacks, connected: false};
        this.sockets.set(key, socketState);
        const qrToken = `EDVANIA-SANDBOX-${connectionId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
        callbacks.onQr(qrToken, Date.now() + 120_000);
        return {
          disconnect: async () => {
            this.sockets.delete(key);
          },
        };
      },
      sendText: async (tenantId, connectionId) => {
        const key = `${tenantId}:${connectionId}`;
        const socketState = this.sockets.get(key);
        if (!socketState || !socketState.connected) {
          throw new WhatsAppSendError("session_not_connected", true, false);
        }
        return {providerMessageId: `sandbox-msg-${randomUUID()}`};
      },
    };

    this.sessionManager = new WhatsAppSessionManager(this.provider);
    this.rateLimiter = new InMemoryTenantRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 20,
      maxDailyPerStore: 500,
    });
  }

  getSnapshot(tenantId: string, connectionId: string): ConnectionSnapshot {
    return this.sessionManager.getStatus(tenantId, connectionId);
  }

  async connect(tenantId: string, connectionId: string): Promise<ConnectionSnapshot> {
    return this.sessionManager.connect(tenantId, connectionId);
  }

  confirmPairing(tenantId: string, connectionId: string): ConnectionSnapshot {
    const key = `${tenantId}:${connectionId}`;
    const socketState = this.sockets.get(key);
    if (socketState) {
      socketState.connected = true;
      socketState.callbacks.onOpen();
    }
    return this.sessionManager.getStatus(tenantId, connectionId);
  }

  async disconnect(tenantId: string, connectionId: string, logout = false): Promise<ConnectionSnapshot> {
    return this.sessionManager.disconnect(tenantId, connectionId, logout);
  }

  async simulateInboundAndReply(params: {
    storeId: string;
    userId: string;
    connectionId: string;
    senderJid: string;
    contactName?: string;
    body: string;
  }): Promise<{replyText: string; outboxStatus: string}> {
    const normalized = normalizeInboundMessage({
      tenantId: params.storeId,
      connectionId: params.connectionId,
      senderId: params.senderJid,
      isFromMe: false,
      isBroadcast: false,
      contactName: params.contactName ?? "Cliente Sandbox",
      providerMessageId: `sandbox-in-${randomUUID()}`,
      messageType: "text",
      body: params.body,
      receivedAtMs: Date.now(),
    });

    const db = getMockDb();
    let conversation = db.whatsapp_conversations.find(
      (c) =>
        c.store_id === params.storeId
        && c.connection_id === params.connectionId
        && c.wa_contact === normalized.senderId,
    );
    const now = new Date().toISOString();
    if (!conversation) {
      conversation = {
        id: randomUUID(),
        store_id: params.storeId,
        connection_id: params.connectionId,
        wa_contact: normalized.senderId,
        contact_name: normalized.contactName ?? null,
        customer_id: null,
        last_message_at: now,
        metadata: {},
        created_at: now,
        updated_at: now,
      };
      db.whatsapp_conversations.push(conversation);
    } else {
      conversation.last_message_at = now;
      conversation.updated_at = now;
    }

    const conversationId = String(conversation.id);
    db.whatsapp_messages.push({
      id: randomUUID(),
      store_id: params.storeId,
      connection_id: params.connectionId,
      conversation_id: conversationId,
      direction: "inbound",
      message_type: "text",
      body: normalized.body,
      external_message_id: normalized.providerMessageId,
      delivery_status: "received",
      sent_at: normalized.receivedAt,
      created_at: now,
    });

    const providers = resolveConfiguredAssistantProviders();
    const turn = await runDomainAssistantTurn({
      context: {storeId: params.storeId, userId: params.userId},
      message: normalized.body,
      primary: providers.primary,
      fallback: providers.fallback,
      rateLimiter: this.rateLimiter,
    });

    const replyText = turn.ok
      ? turn.data.text
      : turn.error.message;

    const outboxId = randomUUID();
    const outboxKey = randomUUID();
    const outboxRow: Record<string, unknown> = {
      id: outboxId,
      store_id: params.storeId,
      connection_id: params.connectionId,
      conversation_id: conversationId,
      idempotency_key: outboxKey,
      recipient: normalized.senderId,
      body: replyText,
      status: "queued",
      attempts: 0,
      available_at: now,
      lease_owner: null,
      lease_token: null,
      lease_expires_at: null,
      provider_message_id: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };
    db.whatsapp_outbox.push(outboxRow);

    const storeAdapter: ClaimableOutboxStore = {
      async claim(storeId, leaseOwner) {
        const target = db.whatsapp_outbox.find(
          (row) => row.id === outboxId && row.store_id === storeId && row.status === "queued",
        );
        if (!target) return [];
        const leaseToken = randomUUID();
        target.status = "sending";
        target.attempts = Number(target.attempts ?? 0) + 1;
        target.lease_owner = leaseOwner;
        target.lease_token = leaseToken;
        return [{
          id: String(target.id),
          tenantId: String(target.store_id),
          connectionId: String(target.connection_id),
          idempotencyKey: String(target.idempotency_key),
          recipient: String(target.recipient),
          body: String(target.body),
          status: "sending",
          attempts: Number(target.attempts),
          maxAttempts: 5,
          leaseOwner,
          leaseToken,
        } satisfies ClaimedOutboxMessage];
      },
      async finalize(claim, update: OutboxFinalization) {
        const target = db.whatsapp_outbox.find(
          (row) =>
            row.id === claim.id
            && row.store_id === claim.tenantId
            && row.lease_token === claim.leaseToken,
        );
        if (!target) return false;
        target.status = update.status;
        target.updated_at = new Date().toISOString();
        if (update.status === "sent") {
          target.provider_message_id = update.providerMessageId;
          target.last_error = null;
          db.whatsapp_messages.push({
            id: randomUUID(),
            store_id: params.storeId,
            connection_id: params.connectionId,
            conversation_id: conversationId,
            direction: "outbound",
            message_type: "text",
            body: replyText,
            external_message_id: update.providerMessageId,
            delivery_status: "sent",
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        } else {
          target.last_error = update.errorCode;
        }
        return true;
      },
    };

    const batch = await dispatchOutboxBatch(
      params.storeId,
      "sandbox-panel-worker",
      storeAdapter,
      createSessionBackedSender(this.sessionManager, this.provider),
      {limit: 1, leaseSeconds: 30},
    );

    const outboxStatus = batch.outcomes[0]?.status ?? "queued";
    return {replyText, outboxStatus};
  }
}

const globalRuntime = globalThis as unknown as {
  __edvaniaSandboxWhatsApp?: SandboxRuntime;
};

export function getSandboxWhatsAppRuntime(): SandboxRuntime {
  if (!globalRuntime.__edvaniaSandboxWhatsApp) {
    globalRuntime.__edvaniaSandboxWhatsApp = new SandboxRuntime();
  }
  return globalRuntime.__edvaniaSandboxWhatsApp;
}
