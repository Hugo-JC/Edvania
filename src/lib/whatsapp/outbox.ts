import {WhatsAppSendError} from "./provider.ts";
import {retryDelayMs} from "./retry.ts";

export type ClaimedOutboxMessage = Readonly<{
  id: string;
  tenantId: string;
  connectionId: string;
  idempotencyKey: string;
  recipient: string;
  body: string;
  status: "sending";
  attempts: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseToken: string;
}>;

export type OutboxFinalization =
  | Readonly<{status: "sent"; providerMessageId: string}>
  | Readonly<{status: "retry_wait"; errorCode: string; availableAt: string}>
  | Readonly<{status: "failed" | "unknown"; errorCode: string}>;

export interface OutboxStore {
  finalize(claim: ClaimedOutboxMessage, update: OutboxFinalization): Promise<boolean>;
}

export interface OutboundSender {
  send(tenantId: string, connectionId: string, recipient: string, body: string, idempotencyKey: string): Promise<{providerMessageId: string}>;
}

export class OutboxLeaseLostError extends Error {
  constructor() {
    super("outbox_lease_lost");
    this.name = "OutboxLeaseLostError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeErrorCodePattern = /^[a-z0-9_]{1,80}$/;

function validateClaim(claim: ClaimedOutboxMessage) {
  if (
    !uuidPattern.test(claim.id)
    || !uuidPattern.test(claim.tenantId)
    || !uuidPattern.test(claim.connectionId)
    || !uuidPattern.test(claim.idempotencyKey)
    || !uuidPattern.test(claim.leaseToken)
    || claim.status !== "sending"
    || !claim.leaseOwner.trim()
    || claim.leaseOwner.length > 120
    || !claim.recipient.trim()
    || claim.recipient.length > 128
    || !claim.body.trim()
    || Array.from(claim.body).length > 4096
    || !Number.isInteger(claim.attempts)
    || !Number.isInteger(claim.maxAttempts)
    || claim.attempts < 1
    || claim.maxAttempts < 1
    || claim.maxAttempts > 20
    || claim.attempts > claim.maxAttempts
  ) {
    throw new RangeError("Invalid claimed WhatsApp outbox message.");
  }
}

function safeErrorCode(error: WhatsAppSendError) {
  return safeErrorCodePattern.test(error.code) ? error.code : "provider_send_failed";
}

export async function dispatchOutboxMessage(
  claim: ClaimedOutboxMessage,
  sender: OutboundSender,
  store: OutboxStore,
  options: Readonly<{now?: () => number; random?: () => number; retryBaseMs?: number; retryMaxMs?: number}> = {},
): Promise<OutboxFinalization> {
  validateClaim(claim);

  let receipt: {providerMessageId: string};
  try {
    receipt = await sender.send(claim.tenantId, claim.connectionId, claim.recipient, claim.body, claim.idempotencyKey);
  } catch (error) {
    const sendError = error instanceof WhatsAppSendError
      ? error
      : new WhatsAppSendError("provider_delivery_unknown", false, true);
    const errorCode = safeErrorCode(sendError);
    const update: OutboxFinalization = sendError.deliveryUnknown
      ? {status: "unknown", errorCode}
      : sendError.retryable && claim.attempts < claim.maxAttempts
        ? {
          status: "retry_wait",
          errorCode,
          availableAt: new Date((options.now ?? Date.now)() + retryDelayMs(
            claim.attempts,
            options.retryBaseMs ?? 1_000,
            options.retryMaxMs ?? 60_000,
            options.random ?? Math.random,
          )).toISOString(),
        }
        : {status: "failed", errorCode};
    await finalizeOrThrow(claim, update, store);
    return update;
  }

  if (!receipt.providerMessageId.trim() || receipt.providerMessageId.length > 256) {
    const update: OutboxFinalization = {status: "unknown", errorCode: "invalid_provider_receipt"};
    await finalizeOrThrow(claim, update, store);
    return update;
  }

  const update: OutboxFinalization = {status: "sent", providerMessageId: receipt.providerMessageId};
  await finalizeOrThrow(claim, update, store);
  return update;
}

async function finalizeOrThrow(claim: ClaimedOutboxMessage, update: OutboxFinalization, store: OutboxStore) {
  if (!await store.finalize(claim, update)) throw new OutboxLeaseLostError();
}
