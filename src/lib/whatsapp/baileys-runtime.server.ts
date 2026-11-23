import "server-only";
import {randomUUID} from "node:crypto";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import {runStoreAssistantConversation} from "@/lib/domain/assistant-orchestration.server";
import type {StoreRole} from "@/lib/domain/contracts";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import {getMockDb} from "@/lib/supabase/mock";
import {
  isBaileysEncryptedDbPersistenceReady,
  createEdvaniaBaileysAuthState,
  type BaileysPersistenceMode,
} from "./baileys-auth-adapter.server";
import {
  extractBaileysText,
  jidToNormalizedSender,
  toWhatsAppJid,
} from "./baileys-utils";
import {ingestInboundMessage} from "./inbound";
import {createServerWhatsAppInboundStore} from "./inbound-store.server";
import type {OutboundSender} from "./outbox";
import {WhatsAppSendError} from "./provider";
import {retryDelayMs} from "./retry";
import {getSandboxWhatsAppRuntime} from "./sandbox-runtime.server";
import type {ConnectionStatus} from "./session-manager";

export type BaileysSnapshot = Readonly<{
  storeId: string;
  connectionId: string;
  provider: "baileys" | "sandbox";
  status: ConnectionStatus;
  generation: number;
  retryAttempt: number;
  qr?: string;
  qrDataUrl?: string;
  qrExpiresAt?: number;
  phoneE164?: string;
  autoReplyEnabled: boolean;
  persistenceMode: BaileysPersistenceMode;
  lastError?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
}>;

type SessionEntry = {
  key: string;
  storeId: string;
  connectionId: string;
  generation: number;
  status: ConnectionStatus;
  retryAttempt: number;
  qr?: string;
  qrDataUrl?: string;
  qrExpiresAt?: number;
  phoneE164?: string;
  autoReplyEnabled: boolean;
  persistenceMode: BaileysPersistenceMode;
  lastError?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  socket?: WASocket;
  wipeAuth?: () => Promise<void>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  manualDisconnect: boolean;
};

const silentLogger = pino({level: "silent"});

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const output = (error as {output?: {statusCode?: number}}).output;
  if (typeof output?.statusCode === "number") return output.statusCode;
  return undefined;
}

class BaileysWhatsAppRuntime {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly locks = new Map<string, Promise<unknown>>();

  private key(storeId: string, connectionId: string) {
    return `${storeId}:${connectionId}`;
  }

  private withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    this.locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  private getOrCreate(storeId: string, connectionId: string): SessionEntry {
    const key = this.key(storeId, connectionId);
    let entry = this.sessions.get(key);
    if (!entry) {
      entry = {
        key,
        storeId,
        connectionId,
        generation: 0,
        status: "disconnected",
        retryAttempt: 0,
        autoReplyEnabled: true,
        persistenceMode: isBaileysEncryptedDbPersistenceReady() ? "encrypted_db" : "ephemeral_memory",
        manualDisconnect: false,
      };
      this.sessions.set(key, entry);
    }
    return entry;
  }

  getSnapshot(
    storeId: string,
    connectionId: string,
    provider: "baileys" | "sandbox" = "baileys",
    dbStatus?: string,
    dbPhone?: string | null,
  ): BaileysSnapshot {
    if (provider === "sandbox") {
      const sb = getSandboxWhatsAppRuntime().getSnapshot(storeId, connectionId);
      const entry = this.getOrCreate(storeId, connectionId);
      return {
        storeId,
        connectionId,
        provider: "sandbox",
        status: sb.status,
        generation: sb.generation,
        retryAttempt: sb.retryAttempt,
        qr: sb.qr,
        qrExpiresAt: sb.qrExpiresAt,
        phoneE164: dbPhone ?? entry.phoneE164,
        autoReplyEnabled: entry.autoReplyEnabled,
        persistenceMode: "ephemeral_memory",
        lastError: sb.lastError,
        lastInboundAt: entry.lastInboundAt,
        lastOutboundAt: entry.lastOutboundAt,
      };
    }

    const entry = this.getOrCreate(storeId, connectionId);
    if (entry.status === "qr_required" && entry.qrExpiresAt && entry.qrExpiresAt <= Date.now()) {
      entry.qr = undefined;
      entry.qrDataUrl = undefined;
      entry.qrExpiresAt = undefined;
      entry.status = "connecting";
    }

    const resolvedStatus: ConnectionStatus =
      entry.generation === 0 && entry.status === "disconnected" && dbStatus === "logged_out"
        ? "logged_out"
        : entry.status;

    return {
      storeId: entry.storeId,
      connectionId: entry.connectionId,
      provider: "baileys",
      status: resolvedStatus,
      generation: entry.generation,
      retryAttempt: entry.retryAttempt,
      ...(entry.qr && entry.qrDataUrl ? {qr: entry.qr, qrDataUrl: entry.qrDataUrl, qrExpiresAt: entry.qrExpiresAt} : {}),
      ...(entry.phoneE164 || dbPhone ? {phoneE164: entry.phoneE164 ?? dbPhone ?? undefined} : {}),
      autoReplyEnabled: entry.autoReplyEnabled,
      persistenceMode: entry.persistenceMode,
      ...(entry.lastError ? {lastError: entry.lastError} : {}),
      ...(entry.lastInboundAt ? {lastInboundAt: entry.lastInboundAt} : {}),
      ...(entry.lastOutboundAt ? {lastOutboundAt: entry.lastOutboundAt} : {}),
    };
  }

  setAutoReply(storeId: string, connectionId: string, enabled: boolean): boolean {
    const entry = this.getOrCreate(storeId, connectionId);
    entry.autoReplyEnabled = enabled;
    return entry.autoReplyEnabled;
  }

  private async updateDbConnection(
    storeId: string,
    connectionId: string,
    patch: {
      connection_status: ConnectionStatus;
      phone_e164?: string | null;
      last_connected_at?: string | null;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    const admin = getSupabaseAdminClient();
    if (admin) {
      await admin
        .from("whatsapp_connections")
        .update({...patch, updated_at: now})
        .eq("store_id", storeId)
        .eq("id", connectionId);
      return;
    }

    const db = getMockDb();
    const row = db.whatsapp_connections.find((c) => c.id === connectionId && c.store_id === storeId);
    if (row) {
      Object.assign(row, patch, {updated_at: now});
    }
  }

  async connect(storeId: string, connectionId: string): Promise<BaileysSnapshot> {
    const key = this.key(storeId, connectionId);
    await this.withLock(key, async () => {
      const entry = this.getOrCreate(storeId, connectionId);
      if (entry.status === "connected" || entry.status === "connecting" || entry.status === "qr_required") {
        return;
      }
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
        entry.reconnectTimer = undefined;
      }
      entry.manualDisconnect = false;
      entry.generation += 1;
      entry.retryAttempt = 0;
      entry.status = "connecting";
      entry.lastError = undefined;
      entry.qr = undefined;
      entry.qrDataUrl = undefined;
      entry.qrExpiresAt = undefined;

      await this.updateDbConnection(storeId, connectionId, {connection_status: "connecting"});
      await this.startSocket(entry, entry.generation);
    });

    // Wait briefly (up to 1.8s) for initial QR or immediate session restore so UI receives it without extra polling.
    const started = Date.now();
    while (Date.now() - started < 1800) {
      const snap = this.getSnapshot(storeId, connectionId);
      if (snap.status === "qr_required" || snap.status === "connected" || snap.status === "error") {
        return snap;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return this.getSnapshot(storeId, connectionId);
  }

  private async startSocket(entry: SessionEntry, generation: number): Promise<void> {
    try {
      const {state, saveCreds, wipe, persistenceMode} = await createEdvaniaBaileysAuthState(
        entry.storeId,
        entry.connectionId,
      );
      if (entry.generation !== generation) return;

      entry.persistenceMode = persistenceMode;
      entry.wipeAuth = wipe;

      let version: [number, number, number] = [2, 3000, 1027934701];
      try {
        const fetched = await Promise.race([
          fetchLatestBaileysVersion(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("wa_version_timeout")), 4000)),
        ]);
        if (fetched?.version) version = fetched.version;
      } catch {
        // Use resilient fallback WA Web version if upstream version check times out.
      }

      if (entry.generation !== generation) return;

      const sock = makeWASocket({
        version,
        logger: silentLogger,
        browser: Browsers.ubuntu("Edvania"),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
        },
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 25_000,
        defaultQueryTimeoutMs: 20_000,
      });

      entry.socket = sock;

      sock.ev.on("creds.update", () => {
        void saveCreds().catch(() => undefined);
      });

      sock.ev.on("connection.update", (update) => {
        if (entry.generation !== generation) return;

        if (update.qr) {
          const qrValue = update.qr;
          void QRCode.toDataURL(qrValue, {
            width: 280,
            margin: 2,
            color: {dark: "#15201C", light: "#FFFFFF"},
          })
            .then((dataUrl) => {
              if (entry.generation !== generation) return;
              entry.qr = qrValue;
              entry.qrDataUrl = dataUrl;
              entry.qrExpiresAt = Date.now() + 90_000;
              entry.status = "qr_required";
              entry.lastError = undefined;
              void this.updateDbConnection(entry.storeId, entry.connectionId, {
                connection_status: "qr_required",
              });
            })
            .catch(() => undefined);
        }

        if (update.connection === "open") {
          entry.status = "connected";
          entry.retryAttempt = 0;
          entry.qr = undefined;
          entry.qrDataUrl = undefined;
          entry.qrExpiresAt = undefined;
          entry.lastError = undefined;

          const ownDigits = (sock.user?.id ?? "").split(":")[0]?.split("@")[0]?.replace(/[^0-9]/g, "");
          const phoneE164 = ownDigits ? `+${ownDigits}` : entry.phoneE164;
          entry.phoneE164 = phoneE164;

          void this.updateDbConnection(entry.storeId, entry.connectionId, {
            connection_status: "connected",
            ...(phoneE164 ? {phone_e164: phoneE164} : {}),
            last_connected_at: new Date().toISOString(),
          });
        }

        if (update.connection === "close") {
          entry.socket = undefined;
          entry.qr = undefined;
          entry.qrDataUrl = undefined;
          entry.qrExpiresAt = undefined;

          if (entry.manualDisconnect) return;

          const statusCode = extractStatusCode(update.lastDisconnect?.error);
          const loggedOut = statusCode === DisconnectReason.loggedOut;

          if (loggedOut) {
            entry.status = "logged_out";
            entry.retryAttempt = 0;
            entry.lastError = "logged_out";
            void wipe();
            void this.updateDbConnection(entry.storeId, entry.connectionId, {
              connection_status: "logged_out",
            });
            return;
          }

          if (entry.retryAttempt < 5) {
            entry.retryAttempt += 1;
            entry.status = "connecting";
            entry.lastError = statusCode ? `close_${statusCode}` : "reconnecting";
            const delay = retryDelayMs(entry.retryAttempt, 1_500, 30_000, Math.random);
            entry.reconnectTimer = setTimeout(() => {
              entry.reconnectTimer = undefined;
              if (entry.generation !== generation || entry.manualDisconnect) return;
              void this.startSocket(entry, generation);
            }, delay);
          } else {
            entry.status = "error";
            entry.lastError = statusCode ? `close_${statusCode}` : "reconnect_limit_reached";
            void this.updateDbConnection(entry.storeId, entry.connectionId, {
              connection_status: "error",
            });
          }
        }
      });

      sock.ev.on("messages.upsert", (event) => {
        if (entry.generation !== generation || event.type !== "notify") return;
        for (const msg of event.messages) {
          void this.handleInboundWAMessage(entry, sock, msg).catch(() => undefined);
        }
      });
    } catch (error) {
      if (entry.generation !== generation) return;
      entry.status = "error";
      entry.lastError = error instanceof Error ? error.message.slice(0, 80) : "baileys_start_failed";
      await this.updateDbConnection(entry.storeId, entry.connectionId, {
        connection_status: "error",
      });
    }
  }

  private async handleInboundWAMessage(
    entry: SessionEntry,
    sock: WASocket,
    msg: {
      key: {id?: string | null; fromMe?: boolean | null; remoteJid?: string | null; remoteJidAlt?: string | null};
      pushName?: string | null;
      message?: Parameters<typeof extractBaileysText>[0];
      messageTimestamp?: number | {toNumber?: () => number} | null;
    },
  ): Promise<void> {
    if (msg.key.fromMe) return;

    const senderJid = jidToNormalizedSender(msg.key.remoteJid, msg.key.remoteJidAlt);
    const body = extractBaileysText(msg.message);
    const providerMessageId = msg.key.id?.trim();
    if (!senderJid || !body || !providerMessageId) return;

    const rawTs = msg.messageTimestamp;
    const tsSeconds =
      typeof rawTs === "number"
        ? rawTs
        : rawTs && typeof rawTs.toNumber === "function"
          ? rawTs.toNumber()
          : Math.floor(Date.now() / 1000);
    const receivedAtMs = Math.min(tsSeconds * 1000, Date.now());
    const contactName = msg.pushName?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 128) || undefined;

    entry.lastInboundAt = new Date().toISOString();

    const admin = getSupabaseAdminClient();
    let conversationId = "";
    let inserted = true;

    if (admin) {
      const store = createServerWhatsAppInboundStore();
      const ingestResult = await ingestInboundMessage(
        {
          tenantId: entry.storeId,
          connectionId: entry.connectionId,
          senderId: senderJid,
          isFromMe: false,
          isBroadcast: false,
          contactName,
          providerMessageId,
          messageType: "text",
          body,
          receivedAtMs,
        },
        store,
      );
      inserted = ingestResult.inserted;
      const {data: conv} = await admin
        .from("whatsapp_conversations")
        .select("id")
        .eq("store_id", entry.storeId)
        .eq("connection_id", entry.connectionId)
        .eq("wa_contact", senderJid)
        .maybeSingle();
      conversationId = conv?.id ?? "";
    } else {
      const db = getMockDb();
      const dup = db.whatsapp_messages.find(
        (m) => m.store_id === entry.storeId && m.connection_id === entry.connectionId && m.external_message_id === providerMessageId,
      );
      if (dup) return;
      const now = new Date(receivedAtMs).toISOString();
      let conversation = db.whatsapp_conversations.find(
        (c) => c.store_id === entry.storeId && c.connection_id === entry.connectionId && c.wa_contact === senderJid,
      );
      if (!conversation) {
        conversation = {
          id: randomUUID(),
          store_id: entry.storeId,
          connection_id: entry.connectionId,
          wa_contact: senderJid,
          contact_name: contactName ?? null,
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
        store_id: entry.storeId,
        connection_id: entry.connectionId,
        conversation_id: conversationId,
        direction: "inbound",
        message_type: "text",
        body,
        external_message_id: providerMessageId,
        delivery_status: "received",
        sent_at: now,
        created_at: now,
      });
    }

    if (!inserted || !entry.autoReplyEnabled) return;

    const operator = await this.resolveStoreOperator(entry.storeId);
    const turn = await runStoreAssistantConversation({
      storeId: entry.storeId,
      userId: operator.userId,
      role: operator.role,
      message: body,
      taskType: "whatsapp_baileys_auto_reply",
    });

    const replyText = turn.result.ok
      ? turn.result.data.text
      : "No momento o nosso assistente não conseguiu consultar a informação. Um operador vai responder em breve.";

    const replyTarget = msg.key.remoteJid ?? senderJid;
    const outboxKey = `baileys-reply-${providerMessageId}`;
    await this.dispatchAndRecordOutbound({
      entry,
      sock,
      conversationId,
      recipientJid: senderJid,
      sendTargetJid: replyTarget,
      body: replyText,
      idempotencyKey: outboxKey,
    });
  }

  private async resolveStoreOperator(storeId: string): Promise<{userId: string; role: StoreRole}> {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const {data} = await admin
        .from("store_memberships")
        .select("user_id,role")
        .eq("store_id", storeId)
        .eq("status", "active")
        .in("role", ["owner", "admin", "manager"])
        .limit(1)
        .maybeSingle();
      if (data) {
        return {userId: data.user_id, role: data.role as StoreRole};
      }
    } else {
      const db = getMockDb();
      const row = db.store_memberships.find(
        (m) =>
          m.store_id === storeId
          && m.status === "active"
          && ["owner", "admin", "manager"].includes(String(m.role)),
      );
      if (row) {
        return {userId: String(row.user_id), role: String(row.role) as StoreRole};
      }
    }
    return {userId: storeId, role: "employee"};
  }

  private async dispatchAndRecordOutbound(params: {
    entry: SessionEntry;
    sock: WASocket;
    conversationId: string;
    recipientJid: string;
    sendTargetJid: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{providerMessageId: string; status: string}> {
    const admin = getSupabaseAdminClient();
    let sentMsgId = `baileys-out-${randomUUID()}`;
    let status = "sent";
    let errorCode: string | null = null;

    try {
      const sent = await params.sock.sendMessage(params.sendTargetJid, {text: params.body});
      if (sent?.key?.id) sentMsgId = sent.key.id;
      params.entry.lastOutboundAt = new Date().toISOString();
    } catch {
      status = "failed";
      errorCode = "baileys_send_failed";
    }

    const now = new Date().toISOString();
    if (admin && params.conversationId) {
      await admin.from("whatsapp_outbox").insert({
        store_id: params.entry.storeId,
        connection_id: params.entry.connectionId,
        conversation_id: params.conversationId,
        idempotency_key: params.idempotencyKey,
        recipient: params.recipientJid,
        body: params.body,
        status,
        attempts: 1,
        provider_message_id: status === "sent" ? sentMsgId : null,
        last_error: errorCode,
      });
      if (status === "sent") {
        await admin.from("whatsapp_messages").insert({
          store_id: params.entry.storeId,
          connection_id: params.entry.connectionId,
          conversation_id: params.conversationId,
          direction: "outbound",
          message_type: "text",
          body: params.body,
          external_message_id: sentMsgId,
          delivery_status: "sent",
          sent_at: now,
        });
      }
    } else if (!admin && params.conversationId) {
      const db = getMockDb();
      db.whatsapp_outbox.push({
        id: randomUUID(),
        store_id: params.entry.storeId,
        connection_id: params.entry.connectionId,
        conversation_id: params.conversationId,
        idempotency_key: params.idempotencyKey,
        recipient: params.recipientJid,
        body: params.body,
        status,
        attempts: 1,
        available_at: now,
        lease_owner: null,
        lease_token: null,
        lease_expires_at: null,
        provider_message_id: status === "sent" ? sentMsgId : null,
        last_error: errorCode,
        created_at: now,
        updated_at: now,
      });
      if (status === "sent") {
        db.whatsapp_messages.push({
          id: randomUUID(),
          store_id: params.entry.storeId,
          connection_id: params.entry.connectionId,
          conversation_id: params.conversationId,
          direction: "outbound",
          message_type: "text",
          body: params.body,
          external_message_id: sentMsgId,
          delivery_status: "sent",
          sent_at: now,
          created_at: now,
        });
      }
    }

    if (status !== "sent") {
      throw new WhatsAppSendError(errorCode ?? "baileys_send_failed", true, true);
    }
    return {providerMessageId: sentMsgId, status};
  }

  async sendText(
    storeId: string,
    connectionId: string,
    recipient: string,
    body: string,
    idempotencyKey = randomUUID(),
  ): Promise<{providerMessageId: string; status: string}> {
    const entry = this.getOrCreate(storeId, connectionId);
    if (entry.status !== "connected" || !entry.socket) {
      throw new WhatsAppSendError("session_not_connected", true, false);
    }

    const recipientJid = toWhatsAppJid(recipient);
    if (!recipientJid) {
      throw new WhatsAppSendError("invalid_recipient", false, false);
    }

    const admin = getSupabaseAdminClient();
    let conversationId = "";
    const now = new Date().toISOString();

    if (admin) {
      const {data: existingConv} = await admin
        .from("whatsapp_conversations")
        .select("id")
        .eq("store_id", storeId)
        .eq("connection_id", connectionId)
        .eq("wa_contact", recipientJid)
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
        await admin
          .from("whatsapp_conversations")
          .update({last_message_at: now, updated_at: now})
          .eq("id", conversationId);
      } else {
        const {data: createdConv} = await admin
          .from("whatsapp_conversations")
          .insert({
            store_id: storeId,
            connection_id: connectionId,
            wa_contact: recipientJid,
            contact_name: recipientJid.split("@")[0],
            last_message_at: now,
          })
          .select("id")
          .single();
        conversationId = createdConv?.id ?? "";
      }
    } else {
      const db = getMockDb();
      let conv = db.whatsapp_conversations.find(
        (c) => c.store_id === storeId && c.connection_id === connectionId && c.wa_contact === recipientJid,
      );
      if (!conv) {
        conv = {
          id: randomUUID(),
          store_id: storeId,
          connection_id: connectionId,
          wa_contact: recipientJid,
          contact_name: recipientJid.split("@")[0],
          customer_id: null,
          last_message_at: now,
          metadata: {},
          created_at: now,
          updated_at: now,
        };
        db.whatsapp_conversations.push(conv);
      } else {
        conv.last_message_at = now;
        conv.updated_at = now;
      }
      conversationId = String(conv.id);
    }

    return this.dispatchAndRecordOutbound({
      entry,
      sock: entry.socket,
      conversationId,
      recipientJid,
      sendTargetJid: recipientJid,
      body,
      idempotencyKey,
    });
  }

  async disconnect(storeId: string, connectionId: string, logout = false): Promise<BaileysSnapshot> {
    const key = this.key(storeId, connectionId);
    await this.withLock(key, async () => {
      const entry = this.getOrCreate(storeId, connectionId);
      entry.manualDisconnect = true;
      entry.generation += 1;
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
        entry.reconnectTimer = undefined;
      }
      entry.qr = undefined;
      entry.qrDataUrl = undefined;
      entry.qrExpiresAt = undefined;
      entry.lastError = undefined;
      entry.status = logout ? "logged_out" : "disconnected";

      const sock = entry.socket;
      entry.socket = undefined;
      if (sock) {
        try {
          if (logout) {
            await sock.logout("Operador terminou a sessão no painel Edvânia.");
          } else {
            await sock.end(undefined);
          }
        } catch {
          // Ignore socket close error during explicit disconnect/logout.
        }
      }
      if (logout) {
        await entry.wipeAuth?.();
        entry.phoneE164 = undefined;
      }

      await this.updateDbConnection(storeId, connectionId, {
        connection_status: entry.status,
      });
    });

    return this.getSnapshot(storeId, connectionId);
  }

  createUnifiedOutboxSender(): OutboundSender {
    const sandboxSender = getSandboxWhatsAppRuntime().createOutboxSender();
    return {
      send: async (tenantId, connectionId, recipient, body, idempotencyKey) => {
        const entry = this.sessions.get(this.key(tenantId, connectionId));
        if (entry?.socket && entry.status === "connected") {
          const targetJid = toWhatsAppJid(recipient);
          if (!targetJid) {
            throw new WhatsAppSendError("invalid_recipient", false, false);
          }
          const res = await entry.socket.sendMessage(targetJid, {text: body});
          entry.lastOutboundAt = new Date().toISOString();
          return {providerMessageId: res?.key?.id ?? `baileys-out-${randomUUID()}`};
        }
        return sandboxSender.send(tenantId, connectionId, recipient, body, idempotencyKey);
      },
    };
  }
}

const globalBaileys = globalThis as unknown as {
  __edvaniaBaileysRuntime?: BaileysWhatsAppRuntime;
};

export function getBaileysWhatsAppRuntime(): BaileysWhatsAppRuntime {
  if (!globalBaileys.__edvaniaBaileysRuntime) {
    globalBaileys.__edvaniaBaileysRuntime = new BaileysWhatsAppRuntime();
  }
  return globalBaileys.__edvaniaBaileysRuntime;
}
