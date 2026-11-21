import type {Database} from "@/lib/supabase/database.types";
import type {ClaimedOutboxMessage, OutboxFinalization, OutboxStore} from "./outbox";

type OutboxRow = Database["public"]["Tables"]["whatsapp_outbox"]["Row"];
type RpcError = Readonly<{message: string}>;
type ClaimArgs = Readonly<{
  p_store_id: string;
  p_lease_owner: string;
  p_limit: number;
  p_lease_seconds: number;
}>;
type FinalizeArgs = Readonly<{
  p_store_id: string;
  p_outbox_id: string;
  p_lease_token: string;
  p_outcome: "sent" | "retry" | "failed" | "unknown";
  p_provider_message_id: string | null;
  p_retry_seconds: number;
  p_error_code: string | null;
}>;

export interface WhatsAppOutboxRpc {
  claim(args: ClaimArgs): Promise<Readonly<{data: readonly OutboxRow[] | null; error: RpcError | null}>>;
  finalize(args: FinalizeArgs): Promise<Readonly<{data: boolean | null; error: RpcError | null}>>;
}

export class WhatsAppOutboxStoreError extends Error {
  constructor(code: "claim_failed" | "claim_invalid_result" | "finalize_failed" | "finalize_invalid_result" | "invalid_retry_delay" | "invalid_error_code") {
    super(code);
    this.name = "WhatsAppOutboxStoreError";
  }
}

const errorCodePattern = /^[a-z0-9_]{1,80}$/;

function mapClaim(row: OutboxRow): ClaimedOutboxMessage {
  if (
    row.status !== "sending"
    || !row.lease_owner
    || !row.lease_token
    || !row.lease_expires_at
  ) {
    throw new WhatsAppOutboxStoreError("claim_invalid_result");
  }
  return {
    id: row.id,
    tenantId: row.store_id,
    connectionId: row.connection_id,
    idempotencyKey: row.idempotency_key,
    recipient: row.recipient,
    body: row.body,
    status: "sending",
    attempts: row.attempts,
    maxAttempts: 20,
    leaseOwner: row.lease_owner,
    leaseToken: row.lease_token,
  };
}

function retrySeconds(availableAt: string, now: () => number) {
  const timestamp = Date.parse(availableAt);
  const seconds = Math.ceil((timestamp - now()) / 1_000);
  if (!Number.isFinite(timestamp) || seconds < 1 || seconds > 3_600) {
    throw new WhatsAppOutboxStoreError("invalid_retry_delay");
  }
  return seconds;
}

function getErrorCode(update: OutboxFinalization) {
  if (update.status === "sent") return null;
  if (!errorCodePattern.test(update.errorCode)) throw new WhatsAppOutboxStoreError("invalid_error_code");
  return update.errorCode;
}

export function createWhatsAppOutboxStore(rpc: WhatsAppOutboxRpc, now: () => number = Date.now) {
  const store: OutboxStore & {
    claim(storeId: string, leaseOwner: string, limit?: number, leaseSeconds?: number): Promise<ClaimedOutboxMessage[]>;
  } = {
    async claim(storeId, leaseOwner, limit = 20, leaseSeconds = 60) {
      if (!storeId.trim() || !leaseOwner.trim() || leaseOwner.length > 120
        || !Number.isInteger(limit) || limit < 1 || limit > 100
        || !Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 300) {
        throw new WhatsAppOutboxStoreError("claim_failed");
      }
      const {data, error} = await rpc.claim({
        p_store_id: storeId,
        p_lease_owner: leaseOwner,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new WhatsAppOutboxStoreError("claim_failed");
      if (!data) throw new WhatsAppOutboxStoreError("claim_invalid_result");
      return data.map(mapClaim);
    },
    async finalize(claim, update) {
      const errorCode = getErrorCode(update);
      const outcome = update.status === "retry_wait" ? "retry" : update.status;
      const result = await rpc.finalize({
        p_store_id: claim.tenantId,
        p_outbox_id: claim.id,
        p_lease_token: claim.leaseToken,
        p_outcome: outcome,
        p_provider_message_id: update.status === "sent" ? update.providerMessageId : null,
        p_retry_seconds: update.status === "retry_wait" ? retrySeconds(update.availableAt, now) : 30,
        p_error_code: errorCode,
      });
      if (result.error) throw new WhatsAppOutboxStoreError("finalize_failed");
      if (typeof result.data !== "boolean") throw new WhatsAppOutboxStoreError("finalize_invalid_result");
      return result.data;
    },
  };
  return store;
}
