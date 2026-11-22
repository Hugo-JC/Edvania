import {
  confirmOperation,
  type ConfirmationContext,
  type ConfirmationOperation,
  type ConfirmationStore,
  type ConfirmedOperationExecutor,
  type OperationPreviewer,
} from "./confirmations.ts";
import type {DomainResult} from "./contracts.ts";

export type RecoveredConfirmationRecord = Readonly<{
  result: DomainResult<unknown>;
  expiresAtMs: number;
}>;

export interface ConfirmationResultRecoveryStore {
  getResult(key: string, nowMs: number): Promise<DomainResult<unknown> | null>;
  saveResult(key: string, result: DomainResult<unknown>, expiresAtMs: number): Promise<void>;
}

export class InMemoryConfirmationRecoveryStore implements ConfirmationResultRecoveryStore {
  private readonly results = new Map<string, RecoveredConfirmationRecord>();

  async getResult(key: string, nowMs: number): Promise<DomainResult<unknown> | null> {
    const entry = this.results.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= nowMs) {
      this.results.delete(key);
      return null;
    }
    return entry.result;
  }

  async saveResult(key: string, result: DomainResult<unknown>, expiresAtMs: number): Promise<void> {
    this.results.set(key, {result, expiresAtMs});
  }
}

function recoveryKey(context: ConfirmationContext, operation: ConfirmationOperation, token: string): string {
  return `${context.tenantId}:${context.userId}:${context.conversationId}:${operation}:${token}`;
}

export async function confirmOperationWithRecovery(
  context: ConfirmationContext,
  operation: ConfirmationOperation,
  input: unknown,
  token: string,
  previewOperation: OperationPreviewer,
  store: ConfirmationStore,
  execute: ConfirmedOperationExecutor,
  recoveryStore: ConfirmationResultRecoveryStore,
  options: Readonly<{nowMs?: number; recoveryTtlMs?: number}> = {},
): Promise<DomainResult<unknown>> {
  const nowMs = options.nowMs ?? Date.now();
  const recoveryTtlMs = options.recoveryTtlMs ?? 5 * 60 * 1000;
  const key = recoveryKey(context, operation, token);

  const cached = await recoveryStore.getResult(key, nowMs);
  if (cached) return cached;

  const result = await confirmOperation(
    context,
    operation,
    input,
    token,
    previewOperation,
    store,
    execute,
    nowMs,
  );
  await recoveryStore.saveResult(key, result, nowMs + recoveryTtlMs);
  return result;
}

export type ConfirmationDraftRecord = Readonly<{
  draftId: string;
  context: ConfirmationContext;
  operation: ConfirmationOperation;
  input: Readonly<Record<string, unknown>>;
  token: string;
  summary: string;
  expiresAt: string;
}>;

export class InMemoryConfirmationDraftStore {
  private readonly drafts = new Map<string, ConfirmationDraftRecord>();

  save(draft: ConfirmationDraftRecord): void {
    this.drafts.set(draft.draftId, draft);
  }

  getForContext(
    draftId: string,
    storeId: string,
    userId: string,
    nowMs = Date.now(),
  ): ConfirmationDraftRecord | null {
    const draft = this.drafts.get(draftId);
    if (!draft) return null;
    if (draft.context.tenantId !== storeId || draft.context.userId !== userId) {
      return null;
    }
    const expiresMs = Date.parse(draft.expiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
      this.drafts.delete(draftId);
      return null;
    }
    return draft;
  }

  deleteForContext(draftId: string, storeId: string, userId: string): boolean {
    const draft = this.drafts.get(draftId);
    if (!draft) return false;
    if (draft.context.tenantId !== storeId || draft.context.userId !== userId) {
      return false;
    }
    return this.drafts.delete(draftId);
  }
}

