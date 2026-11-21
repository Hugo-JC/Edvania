import {createHash, randomBytes, randomUUID} from "node:crypto";
import {closeCashSchema, expenseSchema, openCashSchema, purchaseSchema, saleSchema} from "./contracts.ts";
import type {DomainResult} from "./contracts.ts";

export type ConfirmationOperation =
  | "create_sale"
  | "create_purchase"
  | "open_cash_session"
  | "close_cash_session"
  | "register_expense";

export type ConfirmationContext = Readonly<{
  tenantId: string;
  userId: string;
  conversationId: string;
}>;

export type PendingConfirmation = Readonly<{
  tokenHash: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  operation: ConfirmationOperation;
  fingerprint: string;
  idempotencyKey: string;
  expiresAt: string;
}>;

export type ConsumeConfirmation = Readonly<{
  tokenHash: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  operation: ConfirmationOperation;
  fingerprint: string;
  now: string;
}>;

export interface ConfirmationStore {
  createPending(record: PendingConfirmation): Promise<void>;
  consumePending(input: ConsumeConfirmation): Promise<string | null>;
}

export type OperationPreview = Readonly<{
  summary: string;
  fingerprintData: unknown;
}>;

export type OperationPreviewer = (
  context: ConfirmationContext,
  operation: ConfirmationOperation,
  payload: Readonly<Record<string, unknown>>,
) => Promise<OperationPreview>;

export type ConfirmedOperationExecutor = (
  context: ConfirmationContext,
  operation: ConfirmationOperation,
  payload: Readonly<Record<string, unknown>>,
  idempotencyKey: string,
) => Promise<DomainResult<unknown>>;

export type PreparedConfirmation = Readonly<{
  token: string;
  operation: ConfirmationOperation;
  summary: string;
  expiresAt: string;
}>;

export class ConfirmationError extends Error {
  readonly code: "invalid_intent" | "invalid_confirmation";

  constructor(code: "invalid_intent" | "invalid_confirmation") {
    super(code);
    this.code = code;
    this.name = "ConfirmationError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationSchemas = {
  create_sale: saleSchema.omit({idempotencyKey: true}),
  create_purchase: purchaseSchema.omit({idempotencyKey: true}),
  open_cash_session: openCashSchema.omit({idempotencyKey: true}),
  close_cash_session: closeCashSchema.omit({idempotencyKey: true}),
  register_expense: expenseSchema.omit({idempotencyKey: true}),
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ConfirmationError("invalid_intent");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new ConfirmationError("invalid_intent");
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new ConfirmationError("invalid_intent");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateContext(context: ConfirmationContext) {
  if (!uuidPattern.test(context.tenantId) || !uuidPattern.test(context.userId) || !uuidPattern.test(context.conversationId)) {
    throw new ConfirmationError("invalid_intent");
  }
}

function validateOperation(operation: unknown): operation is ConfirmationOperation {
  return typeof operation === "string" && Object.hasOwn(operationSchemas, operation);
}

function parsePayload(operation: ConfirmationOperation, payload: unknown): Record<string, unknown> {
  const parsed = operationSchemas[operation].safeParse(payload);
  if (!parsed.success || !isRecord(parsed.data)) throw new ConfirmationError("invalid_intent");
  return parsed.data;
}

function fingerprint(payload: Record<string, unknown>, preview: OperationPreview) {
  if (
    typeof preview.summary !== "string"
    || !preview.summary.trim()
    || Array.from(preview.summary).length > 1000
    || /[\u0000-\u001f\u007f]/.test(preview.summary)
  ) {
    throw new ConfirmationError("invalid_intent");
  }
  return sha256(canonicalJson({payload, summary: preview.summary, preview: preview.fingerprintData}));
}

function validateTtl(ttlMs: number) {
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 10 * 60 * 1000) {
    throw new RangeError("Confirmation lifetime must be between 1 second and 10 minutes.");
  }
}

export async function prepareOperationConfirmation(
  context: ConfirmationContext,
  operation: unknown,
  input: unknown,
  previewOperation: OperationPreviewer,
  store: ConfirmationStore,
  options: Readonly<{now?: () => number; ttlMs?: number}> = {},
): Promise<PreparedConfirmation> {
  validateContext(context);
  if (!validateOperation(operation)) throw new ConfirmationError("invalid_intent");
  const payload = parsePayload(operation, input);
  const preview = await previewOperation(context, operation, payload);
  const payloadFingerprint = fingerprint(payload, preview);
  const nowMs = (options.now ?? Date.now)();
  const ttlMs = options.ttlMs ?? 2 * 60 * 1000;
  if (!Number.isFinite(nowMs)) throw new RangeError("Invalid clock value.");
  validateTtl(ttlMs);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(nowMs + ttlMs).toISOString();
  const idempotencyKey = randomUUID();
  await store.createPending({
    tokenHash: sha256(token),
    tenantId: context.tenantId,
    userId: context.userId,
    conversationId: context.conversationId,
    operation,
    fingerprint: payloadFingerprint,
    idempotencyKey,
    expiresAt,
  });
  return {token, operation, summary: preview.summary, expiresAt};
}

export async function confirmOperation(
  context: ConfirmationContext,
  operation: unknown,
  input: unknown,
  token: string,
  previewOperation: OperationPreviewer,
  store: ConfirmationStore,
  execute: ConfirmedOperationExecutor,
  nowMs = Date.now(),
): Promise<DomainResult<unknown>> {
  validateContext(context);
  if (!validateOperation(operation) || !/^[A-Za-z0-9_-]{40,60}$/.test(token) || !Number.isFinite(nowMs)) {
    throw new ConfirmationError("invalid_confirmation");
  }
  const payload = parsePayload(operation, input);
  const preview = await previewOperation(context, operation, payload);
  const payloadFingerprint = fingerprint(payload, preview);
  const consumed = await store.consumePending({
    tokenHash: sha256(token),
    tenantId: context.tenantId,
    userId: context.userId,
    conversationId: context.conversationId,
    operation,
    fingerprint: payloadFingerprint,
    now: new Date(nowMs).toISOString(),
  });
  if (!consumed || !uuidPattern.test(consumed)) throw new ConfirmationError("invalid_confirmation");
  return execute(context, operation, payload, consumed);
}
