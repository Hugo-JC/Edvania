export type InboundMessageInput = Readonly<{
  tenantId: string;
  connectionId: string;
  senderId: string;
  isFromMe: boolean;
  isBroadcast: boolean;
  contactName?: string | null;
  providerMessageId: string;
  messageType: string;
  body?: string | null;
  receivedAtMs: number;
}>;

export type NormalizedInboundMessage = Readonly<{
  tenantId: string;
  connectionId: string;
  senderId: string;
  contactName?: string;
  providerMessageId: string;
  idempotencyKey: string;
  messageType: "text";
  body: string;
  receivedAt: string;
}>;

export type InboundMessageResult = Readonly<{
  messageId: string;
  jobId: string;
  inserted: boolean;
}>;

export interface InboundMessageStore {
  enqueueInbound(message: NormalizedInboundMessage): Promise<InboundMessageResult>;
}

export class InboundMessageError extends Error {
  readonly code: "invalid_input" | "unsupported_message_type";

  constructor(code: "invalid_input" | "unsupported_message_type") {
    super(code);
    this.code = code;
    this.name = "InboundMessageError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const controlCharacters = /[\u0000-\u001f\u007f]/;

function isBoundedText(value: string, maximum: number) {
  return value.trim().length > 0 && Array.from(value).length <= maximum && !controlCharacters.test(value);
}

export function normalizeInboundMessage(input: InboundMessageInput, nowMs = Date.now()): NormalizedInboundMessage {
  if (
    !uuidPattern.test(input.tenantId)
    || !uuidPattern.test(input.connectionId)
    || !isBoundedText(input.senderId, 128)
    || !/^[0-9]{1,20}@s\.whatsapp\.net$/.test(input.senderId)
    || typeof input.isFromMe !== "boolean"
    || input.isFromMe
    || typeof input.isBroadcast !== "boolean"
    || input.isBroadcast
    || !isBoundedText(input.providerMessageId, 200)
    || !Number.isFinite(input.receivedAtMs)
    || input.receivedAtMs < 0
    || !Number.isFinite(nowMs)
    || input.receivedAtMs > nowMs + 5 * 60 * 1000
  ) {
    throw new InboundMessageError("invalid_input");
  }
  if (input.messageType !== "text") throw new InboundMessageError("unsupported_message_type");
  if (typeof input.body !== "string" || !isBoundedText(input.body, 4096)) {
    throw new InboundMessageError("invalid_input");
  }
  if (input.contactName != null && !isBoundedText(input.contactName, 128)) {
    throw new InboundMessageError("invalid_input");
  }

  return {
    tenantId: input.tenantId,
    connectionId: input.connectionId,
    senderId: input.senderId,
    ...(input.contactName?.trim() ? {contactName: input.contactName.trim()} : {}),
    providerMessageId: input.providerMessageId,
    idempotencyKey: input.providerMessageId,
    messageType: "text",
    body: input.body,
    receivedAt: new Date(input.receivedAtMs).toISOString(),
  };
}

export async function ingestInboundMessage(
  input: InboundMessageInput,
  store: InboundMessageStore,
  nowMs = Date.now(),
): Promise<InboundMessageResult> {
  const message = normalizeInboundMessage(input, nowMs);
  return store.enqueueInbound(message);
}
