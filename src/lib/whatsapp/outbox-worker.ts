import {dispatchOutboxMessage, type OutboundSender, type OutboxFinalization, type OutboxStore, type ClaimedOutboxMessage} from "./outbox.ts";

export interface ClaimableOutboxStore extends OutboxStore {
  claim(storeId: string, leaseOwner: string, limit: number, leaseSeconds: number): Promise<ClaimedOutboxMessage[]>;
}

export type OutboxBatchResult = Readonly<{
  claimed: number;
  outcomes: readonly OutboxFinalization[];
}>;

export async function dispatchOutboxBatch(
  storeId: string,
  leaseOwner: string,
  store: ClaimableOutboxStore,
  sender: OutboundSender,
  options: Readonly<{
    limit?: number;
    leaseSeconds?: number;
    now?: () => number;
    random?: () => number;
    retryBaseMs?: number;
    retryMaxMs?: number;
  }> = {},
): Promise<OutboxBatchResult> {
  const limit = options.limit ?? 10;
  const leaseSeconds = options.leaseSeconds ?? 60;
  if (!storeId.trim() || !leaseOwner.trim()
    || !Number.isInteger(limit) || limit < 1 || limit > 100
    || !Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 300) {
    throw new RangeError("Invalid WhatsApp outbox batch scope or bounds.");
  }

  const claims = await store.claim(storeId, leaseOwner, limit, leaseSeconds);
  if (!Array.isArray(claims) || claims.length > limit) {
    throw new RangeError("Invalid WhatsApp outbox claim result.");
  }

  const outcomes: OutboxFinalization[] = [];
  for (const claim of claims) {
    if (claim.tenantId !== storeId) throw new RangeError("Outbox claim escaped the requested tenant scope.");
    outcomes.push(await dispatchOutboxMessage(claim, sender, store, options));
  }
  return {claimed: claims.length, outcomes};
}
