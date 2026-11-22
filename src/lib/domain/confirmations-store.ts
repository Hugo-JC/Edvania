import type {ConfirmationStore, ConsumeConfirmation, PendingConfirmation} from "./confirmations.ts";

export class InMemoryConfirmationStore implements ConfirmationStore {
  private readonly records = new Map<string, PendingConfirmation>();

  async createPending(record: PendingConfirmation): Promise<void> {
    this.records.set(record.tokenHash, record);
  }

  async consumePending(input: ConsumeConfirmation): Promise<string | null> {
    const record = this.records.get(input.tokenHash);
    if (!record) return null;

    const nowMs = Date.parse(input.now);
    const expiresMs = Date.parse(record.expiresAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || expiresMs <= nowMs) {
      this.records.delete(input.tokenHash);
      return null;
    }

    if (
      record.tenantId !== input.tenantId
      || record.userId !== input.userId
      || record.conversationId !== input.conversationId
      || record.operation !== input.operation
      || record.fingerprint !== input.fingerprint
    ) {
      return null;
    }

    this.records.delete(input.tokenHash);
    return record.idempotencyKey;
  }

  pruneExpired(nowIso = new Date().toISOString()): number {
    const nowMs = Date.parse(nowIso);
    let removed = 0;
    for (const [key, record] of this.records.entries()) {
      if (Date.parse(record.expiresAt) <= nowMs) {
        this.records.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.records.size;
  }
}
