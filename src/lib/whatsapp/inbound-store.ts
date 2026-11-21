import type {Database} from "@/lib/supabase/database.types";
import type {InboundMessageResult, InboundMessageStore, NormalizedInboundMessage} from "./inbound";

type InboundRpcArgs = Readonly<{
  p_store_id: string;
  p_connection_id: string;
  p_sender_id: string;
  p_contact_name: string | null;
  p_external_message_id: string;
  p_body: string;
  p_received_at: string;
}>;
type InboundRpcRow = Database["public"]["Functions"]["enqueue_whatsapp_inbound"]["Returns"][number];
type RpcError = Readonly<{message: string}>;

export interface WhatsAppInboundRpc {
  enqueue(args: InboundRpcArgs): Promise<Readonly<{data: readonly InboundRpcRow[] | null; error: RpcError | null}>>;
}

export class WhatsAppInboundStoreError extends Error {
  constructor(code: "enqueue_failed" | "enqueue_invalid_result") {
    super(code);
    this.name = "WhatsAppInboundStoreError";
  }
}

export function createWhatsAppInboundStore(rpc: WhatsAppInboundRpc): InboundMessageStore {
  return {
    async enqueueInbound(message: NormalizedInboundMessage): Promise<InboundMessageResult> {
      const {data, error} = await rpc.enqueue({
        p_store_id: message.tenantId,
        p_connection_id: message.connectionId,
        p_sender_id: message.senderId,
        p_contact_name: message.contactName ?? null,
        p_external_message_id: message.providerMessageId,
        p_body: message.body,
        p_received_at: message.receivedAt,
      });
      if (error) throw new WhatsAppInboundStoreError("enqueue_failed");
      if (!data || data.length !== 1) throw new WhatsAppInboundStoreError("enqueue_invalid_result");
      const row = data[0];
      if (!row.message_id || !row.job_id || typeof row.inserted !== "boolean") {
        throw new WhatsAppInboundStoreError("enqueue_invalid_result");
      }
      return {messageId: row.message_id, jobId: row.job_id, inserted: row.inserted};
    },
  };
}
