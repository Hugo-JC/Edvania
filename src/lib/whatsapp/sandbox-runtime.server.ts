import "server-only";
import {randomUUID} from "node:crypto";
import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import {runDomainAssistantTurn} from "@/lib/domain/assistant-orchestration.server";
import {resolveConfiguredAssistantProviders} from "@/lib/domain/assistant-providers.server";
import {InMemoryTenantRateLimiter} from "@/lib/domain/assistant-rate-limit";
import {recordAiUsageLog} from "@/lib/domain/assistant-usage.server";
import {getPublicEnv, isSupabaseConfigured} from "@/lib/env";
import type {Database} from "@/lib/supabase/database.types";
import {getMockDb} from "@/lib/supabase/mock";
import {ingestInboundMessage} from "./inbound";
import {createServerWhatsAppInboundStore} from "./inbound-store.server";
import type {ClaimedOutboxMessage, OutboundSender, OutboxFinalization} from "./outbox";
import {createServerWhatsAppOutboxStore} from "./outbox-store.server";
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

  createOutboxSender(): OutboundSender {
    return createSessionBackedSender(this.sessionManager, this.provider);
  }

  createMockOutboxStore(): ClaimableOutboxStore {
    const db = getMockDb();
    return {
      async claim(storeId, leaseOwner, limit) {
        const eligible = db.whatsapp_outbox
          .filter(
            (row) =>
              row.store_id === storeId
              && (row.status === "queued" || row.status === "retry_wait"),
          )
          .slice(0, limit);
        const claimed: ClaimedOutboxMessage[] = [];
        for (const target of eligible) {
          const leaseToken = randomUUID();
          target.status = "sending";
          target.attempts = Number(target.attempts ?? 0) + 1;
          target.lease_owner = leaseOwner;
          target.lease_token = leaseToken;
          claimed.push({
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
          });
        }
        return claimed;
      },
      async finalize(claim, update: OutboxFinalization) {
        const target = db.whatsapp_outbox.find(
          (row) =>
            row.id === claim.id
            && row.store_id === claim.tenantId
            && row.lease_token === claim.leaseToken,
        );
        if (!target) return false;
        const now = new Date().toISOString();
        target.status = update.status;
        target.updated_at = now;
        if (update.status === "sent") {
          target.provider_message_id = update.providerMessageId;
          target.last_error = null;
          db.whatsapp_messages.push({
            id: randomUUID(),
            store_id: claim.tenantId,
            connection_id: claim.connectionId,
            conversation_id: String(target.conversation_id),
            direction: "outbound",
            message_type: "text",
            body: claim.body,
            external_message_id: update.providerMessageId,
            delivery_status: "sent",
            sent_at: now,
            created_at: now,
          });
        } else {
          target.last_error = update.errorCode;
          if (update.status === "retry_wait") {
            target.available_at = update.availableAt;
          }
        }
        return true;
      },
    };
  }

  async simulateInboundAndReply(params: {
    storeId: string;
    userId: string;
    connectionId: string;
    senderJid: string;
    contactName?: string;
    body: string;
  }): Promise<{replyText: string; outboxStatus: string}> {
    const providerMessageId = `sandbox-in-${randomUUID()}`;
    const receivedAtMs = Date.now();
    const useSupabase = Boolean(isSupabaseConfigured() && process.env.SUPABASE_SECRET_KEY?.trim());

    let conversationId = "";
    if (useSupabase) {
      const {url} = getPublicEnv();
      const admin = createSupabaseClient<Database>(url, process.env.SUPABASE_SECRET_KEY!.trim(), {
        auth: {autoRefreshToken: false, persistSession: false},
      });
      try {
        const inboundStore = createServerWhatsAppInboundStore();
        await ingestInboundMessage(
          {
            tenantId: params.storeId,
            connectionId: params.connectionId,
            senderId: params.senderJid,
            isFromMe: false,
            isBroadcast: false,
            contactName: params.contactName ?? "Cliente Sandbox",
            providerMessageId,
            messageType: "text",
            body: params.body,
            receivedAtMs,
          },
          inboundStore,
          receivedAtMs,
        );
        const {data: conv} = await admin
          .from("whatsapp_conversations")
          .select("id")
          .eq("store_id", params.storeId)
          .eq("connection_id", params.connectionId)
          .eq("wa_contact", params.senderJid)
          .maybeSingle();
        conversationId = conv?.id ?? "";
      } catch {
        const nowIso = new Date(receivedAtMs).toISOString();
        const {data: existingConv} = await admin
          .from("whatsapp_conversations")
          .select("id")
          .eq("store_id", params.storeId)
          .eq("wa_contact", params.senderJid)
          .maybeSingle();
        if (existingConv) {
          conversationId = existingConv.id;
        } else {
          const {data: createdConv} = await admin
            .from("whatsapp_conversations")
            .insert({
              store_id: params.storeId,
              wa_contact: params.senderJid,
              contact_name: params.contactName ?? "Cliente Sandbox",
              last_message_at: nowIso,
            } as never)
            .select("id")
            .single();
          conversationId = createdConv?.id ?? "";
        }
        if (conversationId) {
          await admin.from("whatsapp_messages").insert({
            store_id: params.storeId,
            conversation_id: conversationId,
            direction: "inbound",
            message_type: "text",
            body: params.body,
            external_message_id: providerMessageId,
            delivery_status: "received",
            sent_at: nowIso,
          } as never);
        }
      }
    } else {
      const db = getMockDb();
      let conversation = db.whatsapp_conversations.find(
        (c) =>
          c.store_id === params.storeId
          && c.connection_id === params.connectionId
          && c.wa_contact === params.senderJid,
      );
      const now = new Date(receivedAtMs).toISOString();
      if (!conversation) {
        conversation = {
          id: randomUUID(),
          store_id: params.storeId,
          connection_id: params.connectionId,
          wa_contact: params.senderJid,
          contact_name: params.contactName ?? "Cliente Sandbox",
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
      conversationId = String(conversation.id);
      db.whatsapp_messages.push({
        id: randomUUID(),
        store_id: params.storeId,
        connection_id: params.connectionId,
        conversation_id: conversationId,
        direction: "inbound",
        message_type: "text",
        body: params.body,
        external_message_id: providerMessageId,
        delivery_status: "received",
        sent_at: now,
        created_at: now,
      });
    }

    const providers = resolveConfiguredAssistantProviders();
    const startMs = Date.now();
    const turn = await runDomainAssistantTurn({
      context: {storeId: params.storeId, userId: params.userId},
      message: params.body,
      primary: providers.primary,
      fallback: providers.fallback,
      rateLimiter: this.rateLimiter,
    });
    const latencyMs = Date.now() - startMs;

    await recordAiUsageLog({
      storeId: params.storeId,
      provider: providers.mode === "configured" ? providers.primaryProvider : "sandbox",
      model: providers.primaryModel,
      success: turn.ok,
      latencyMs,
      statusCode: turn.ok ? 200 : 500,
      taskType: "whatsapp_sandbox_reply",
    });

    const replyText = turn.ok ? turn.data.text : turn.error.message;
    const now = new Date().toISOString();
    const outboxKey = randomUUID();

    if (useSupabase && conversationId) {
      const {url} = getPublicEnv();
      const admin = createSupabaseClient<Database>(url, process.env.SUPABASE_SECRET_KEY!.trim(), {
        auth: {autoRefreshToken: false, persistSession: false},
      });
      const outboxInsert = await admin.from("whatsapp_outbox").insert({
        store_id: params.storeId,
        connection_id: params.connectionId,
        conversation_id: conversationId,
        idempotency_key: outboxKey,
        recipient: params.senderJid,
        body: replyText,
        status: "queued",
      });

      if (outboxInsert.error) {
        await admin.from("whatsapp_messages").insert({
          store_id: params.storeId,
          conversation_id: conversationId,
          direction: "outbound",
          message_type: "text",
          body: replyText,
          external_message_id: `sandbox-out-${outboxKey}`,
          delivery_status: "sent",
          sent_at: now,
        } as never);
        return {replyText, outboxStatus: "sent"};
      }

      const batch = await dispatchOutboxBatch(
        params.storeId,
        "sandbox-panel-worker",
        createServerWhatsAppOutboxStore(),
        this.createOutboxSender(),
        {limit: 5, leaseSeconds: 30},
      );
      return {replyText, outboxStatus: batch.outcomes[0]?.status ?? "queued"};
    }

    const db = getMockDb();
    db.whatsapp_outbox.push({
      id: randomUUID(),
      store_id: params.storeId,
      connection_id: params.connectionId,
      conversation_id: conversationId,
      idempotency_key: outboxKey,
      recipient: params.senderJid,
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
    });

    const batch = await dispatchOutboxBatch(
      params.storeId,
      "sandbox-panel-worker",
      this.createMockOutboxStore(),
      this.createOutboxSender(),
      {limit: 5, leaseSeconds: 30},
    );
    return {replyText, outboxStatus: batch.outcomes[0]?.status ?? "queued"};
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
