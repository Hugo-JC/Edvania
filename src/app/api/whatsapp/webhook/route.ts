import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {getPublicEnv, isSupabaseConfigured} from "@/lib/env";
import type {Database} from "@/lib/supabase/database.types";
import {getMockDb} from "@/lib/supabase/mock";
import {ingestInboundMessage, InboundMessageError} from "@/lib/whatsapp/inbound";
import {createServerWhatsAppInboundStore} from "@/lib/whatsapp/inbound-store.server";
import {verifyWhatsAppWebhookSignature} from "@/lib/whatsapp/webhook-auth";

const webhookBodySchema = z.object({
  connectionId: z.string().uuid(),
  senderId: z.string().min(1).max(128),
  isFromMe: z.boolean().default(false),
  isBroadcast: z.boolean().default(false),
  contactName: z.string().max(128).nullable().optional(),
  providerMessageId: z.string().min(1).max(200),
  messageType: z.string().min(1).max(40),
  body: z.string().max(4096).nullable().optional(),
  receivedAtMs: z.number().finite().nonnegative(),
}).strict();

const MAX_WEBHOOK_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({error: "webhook_not_configured"}, {status: 503});
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({error: "payload_too_large"}, {status: 413});
  }

  const signature = request.headers.get("x-edvania-signature");
  if (!verifyWhatsAppWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({error: "invalid_signature"}, {status: 401});
  }

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({error: "invalid_json"}, {status: 400});
  }

  const parsed = webhookBodySchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({error: "invalid_payload"}, {status: 400});
  }

  const input = parsed.data;
  if (input.isFromMe || input.isBroadcast) {
    return NextResponse.json({accepted: true, ignored: true}, {status: 202});
  }

  let storeId: string | null = null;
  if (isSupabaseConfigured() && process.env.SUPABASE_SECRET_KEY?.trim()) {
    const {url} = getPublicEnv();
    const admin = createSupabaseClient<Database>(url, process.env.SUPABASE_SECRET_KEY.trim(), {
      auth: {autoRefreshToken: false, persistSession: false},
    });
    const {data: connection} = await admin
      .from("whatsapp_connections")
      .select("store_id")
      .eq("id", input.connectionId)
      .maybeSingle();
    storeId = connection?.store_id ?? null;
  } else {
    const mockDb = getMockDb();
    const connection = mockDb.whatsapp_connections.find((c) => c.id === input.connectionId);
    storeId = connection ? String(connection.store_id) : null;
  }

  if (!storeId) {
    return NextResponse.json({error: "unknown_connection"}, {status: 404});
  }

  try {
    if (isSupabaseConfigured() && process.env.SUPABASE_SECRET_KEY?.trim()) {
      const store = createServerWhatsAppInboundStore();
      const result = await ingestInboundMessage({
        tenantId: storeId,
        connectionId: input.connectionId,
        senderId: input.senderId,
        isFromMe: input.isFromMe,
        isBroadcast: input.isBroadcast,
        contactName: input.contactName,
        providerMessageId: input.providerMessageId,
        messageType: input.messageType,
        body: input.body,
        receivedAtMs: input.receivedAtMs,
      }, store);
      return NextResponse.json({accepted: true, ...result}, {status: 202});
    }

    const result = await ingestInboundMessage({
      tenantId: storeId,
      connectionId: input.connectionId,
      senderId: input.senderId,
      isFromMe: input.isFromMe,
      isBroadcast: input.isBroadcast,
      contactName: input.contactName,
      providerMessageId: input.providerMessageId,
      messageType: input.messageType,
      body: input.body,
      receivedAtMs: input.receivedAtMs,
    }, {
      async enqueueInbound(message) {
        const mockDb = getMockDb();
        const existing = mockDb.whatsapp_messages.find(
          (m) =>
            m.store_id === message.tenantId
            && m.connection_id === message.connectionId
            && m.external_message_id === message.providerMessageId,
        );
        if (existing) {
          return {
            messageId: String(existing.id),
            jobId: String(existing.id),
            inserted: false,
          };
        }
        const now = new Date().toISOString();
        let conversation = mockDb.whatsapp_conversations.find(
          (c) =>
            c.store_id === message.tenantId
            && c.connection_id === message.connectionId
            && c.wa_contact === message.senderId,
        );
        if (!conversation) {
          conversation = {
            id: crypto.randomUUID(),
            store_id: message.tenantId,
            connection_id: message.connectionId,
            wa_contact: message.senderId,
            contact_name: message.contactName ?? null,
            customer_id: null,
            last_message_at: now,
            metadata: {},
            created_at: now,
            updated_at: now,
          };
          mockDb.whatsapp_conversations.push(conversation);
        }
        const messageId = crypto.randomUUID();
        mockDb.whatsapp_messages.push({
          id: messageId,
          store_id: message.tenantId,
          connection_id: message.connectionId,
          conversation_id: String(conversation.id),
          direction: "inbound",
          message_type: "text",
          body: message.body,
          external_message_id: message.providerMessageId,
          delivery_status: "received",
          sent_at: message.receivedAt,
          created_at: now,
        });
        return {messageId, jobId: crypto.randomUUID(), inserted: true};
      },
    });
    return NextResponse.json({accepted: true, ...result}, {status: 202});
  } catch (error) {
    if (error instanceof InboundMessageError) {
      return NextResponse.json({error: error.code}, {status: 400});
    }
    return NextResponse.json({error: "ingress_failed"}, {status: 500});
  }
}
