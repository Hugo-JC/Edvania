import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import type {Database, Json} from "@/lib/supabase/database.types";
import {
  ConfirmationError,
  type ConfirmationContext,
  type ConfirmationOperation,
  type ConfirmationStore,
  type ConfirmedOperationExecutor,
  type ConsumeConfirmation,
  type OperationPreviewer,
  type PendingConfirmation,
} from "./confirmations";
import {failure, type DomainResult, type ToolContext} from "./contracts";
import {
  closeCashSession,
  createPurchase,
  createSale,
  openCashSession,
  registerExpense,
} from "./services";
import {
  InMemoryConfirmationDraftStore,
  InMemoryConfirmationRecoveryStore,
  type ConfirmationResultRecoveryStore,
} from "./confirmations-recovery";
import {InMemoryConfirmationStore} from "./confirmations-store";

const globalConfirmations = globalThis as unknown as {
  __edvaniaConfirmationStore?: InMemoryConfirmationStore;
  __edvaniaConfirmationRecoveryStore?: InMemoryConfirmationRecoveryStore;
  __edvaniaConfirmationDraftStore?: InMemoryConfirmationDraftStore;
};

function getMemoryConfirmationStore(): InMemoryConfirmationStore {
  if (!globalConfirmations.__edvaniaConfirmationStore) {
    globalConfirmations.__edvaniaConfirmationStore = new InMemoryConfirmationStore();
  }
  return globalConfirmations.__edvaniaConfirmationStore;
}

function getMemoryRecoveryStore(): InMemoryConfirmationRecoveryStore {
  if (!globalConfirmations.__edvaniaConfirmationRecoveryStore) {
    globalConfirmations.__edvaniaConfirmationRecoveryStore = new InMemoryConfirmationRecoveryStore();
  }
  return globalConfirmations.__edvaniaConfirmationRecoveryStore;
}

function isRpcMissingError(message: string | undefined): boolean {
  if (!message) return false;
  return /PGRST202|Could not find the function|does not exist/i.test(message);
}

export function getSharedConfirmationStore(): ConfirmationStore {
  const memoryStore = getMemoryConfirmationStore();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return memoryStore;
  }

  return {
    async createPending(record: PendingConfirmation) {
      const {error} = await admin.rpc("create_assistant_confirmation", {
        p_token_hash: record.tokenHash,
        p_store_id: record.tenantId,
        p_user_id: record.userId,
        p_conversation_id: record.conversationId,
        p_operation: record.operation,
        p_fingerprint: record.fingerprint,
        p_idempotency_key: record.idempotencyKey,
        p_expires_at: record.expiresAt,
      });
      if (!error) return;
      if (isRpcMissingError(error.message)) {
        await memoryStore.createPending(record);
        return;
      }
      throw new ConfirmationError("invalid_intent");
    },
    async consumePending(input: ConsumeConfirmation) {
      const {data, error} = await admin.rpc("consume_assistant_confirmation", {
        p_token_hash: input.tokenHash,
        p_store_id: input.tenantId,
        p_user_id: input.userId,
        p_conversation_id: input.conversationId,
        p_operation: input.operation,
        p_fingerprint: input.fingerprint,
        p_now: input.now,
      });
      if (!error) {
        return typeof data === "string" ? data : null;
      }
      if (isRpcMissingError(error.message)) {
        return memoryStore.consumePending(input);
      }
      return null;
    },
  };
}

function parseRecoveryKey(key: string): {
  tenantId: string;
  userId: string;
  conversationId: string;
  operation: string;
  tokenHash: string;
} | null {
  const parts = key.split(":");
  if (parts.length !== 5) return null;
  const [tenantId, userId, conversationId, operation, token] = parts;
  if (!tenantId || !userId || !conversationId || !operation || !token) return null;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  return {tenantId, userId, conversationId, operation, tokenHash};
}

export function getSharedConfirmationRecoveryStore(): ConfirmationResultRecoveryStore {
  const memoryStore = getMemoryRecoveryStore();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return memoryStore;
  }

  return {
    async getResult(key, nowMs) {
      const parsedKey = parseRecoveryKey(key);
      if (!parsedKey) return memoryStore.getResult(key, nowMs);
      const {data, error} = await admin.rpc("get_assistant_confirmation_result", {
        p_token_hash: parsedKey.tokenHash,
        p_store_id: parsedKey.tenantId,
        p_user_id: parsedKey.userId,
        p_conversation_id: parsedKey.conversationId,
        p_operation: parsedKey.operation,
      });
      if (error && isRpcMissingError(error.message)) {
        return memoryStore.getResult(key, nowMs);
      }
      if (!error && data && typeof data === "object" && !Array.isArray(data) && "ok" in data) {
        return data as unknown as DomainResult<unknown>;
      }
      return memoryStore.getResult(key, nowMs);
    },
    async saveResult(key, result, expiresAtMs) {
      await memoryStore.saveResult(key, result, expiresAtMs);
      const parsedKey = parseRecoveryKey(key);
      if (!parsedKey) return;
      await admin.rpc("save_assistant_confirmation_result", {
        p_token_hash: parsedKey.tokenHash,
        p_store_id: parsedKey.tenantId,
        p_user_id: parsedKey.userId,
        p_conversation_id: parsedKey.conversationId,
        p_operation: parsedKey.operation,
        p_result_json: result as unknown as Json,
      });
    },
  };
}

export function getSharedConfirmationDraftStore(): InMemoryConfirmationDraftStore {
  if (!globalConfirmations.__edvaniaConfirmationDraftStore) {
    globalConfirmations.__edvaniaConfirmationDraftStore = new InMemoryConfirmationDraftStore();
  }
  return globalConfirmations.__edvaniaConfirmationDraftStore;
}

const money = new Intl.NumberFormat("pt-AO", {style: "currency", currency: "AOA", maximumFractionDigits: 2});

export function createDomainOperationPreviewer(supabase: SupabaseClient<Database>): OperationPreviewer {
  return async (
    context: ConfirmationContext,
    operation: ConfirmationOperation,
    payload: Readonly<Record<string, unknown>>,
  ) => {
    if (operation === "create_sale") {
      const items = payload.items as {productId: string; quantity: number}[];
      const productIds = items.map((item) => item.productId);
      const {data: products, error} = await supabase
        .from("products")
        .select("id,name,sale_price")
        .eq("store_id", context.tenantId)
        .in("id", productIds);
      if (error || !products?.length) throw new ConfirmationError("invalid_intent");

      const byId = new Map(products.map((p) => [p.id, p]));
      let total = 0;
      const lines: {productId: string; name: string; quantity: number; unitPrice: number}[] = [];
      for (const item of items) {
        const product = byId.get(item.productId);
        if (!product) throw new ConfirmationError("invalid_intent");
        const unitPrice = Number(product.sale_price);
        total += unitPrice * item.quantity;
        lines.push({productId: product.id, name: product.name, quantity: item.quantity, unitPrice});
      }
      const paidAmount = Number(payload.paidAmount ?? 0);
      return {
        summary: `Venda de ${lines.length} artigo(s) · Total ${money.format(total)} · Recebido ${money.format(paidAmount)}`,
        fingerprintData: {lines, total, paidAmount, paymentMethod: payload.paymentMethod},
      };
    }

    if (operation === "create_purchase") {
      const items = payload.items as {productId: string; quantity: number; unitCost: number}[];
      const productIds = items.map((item) => item.productId);
      const {data: products, error} = await supabase
        .from("products")
        .select("id,name")
        .eq("store_id", context.tenantId)
        .in("id", productIds);
      if (error || !products?.length) throw new ConfirmationError("invalid_intent");
      const byId = new Map(products.map((p) => [p.id, p]));
      let total = 0;
      for (const item of items) {
        if (!byId.has(item.productId)) throw new ConfirmationError("invalid_intent");
        total += item.quantity * item.unitCost;
      }
      return {
        summary: `Compra de ${items.length} artigo(s) · Total ${money.format(total)} com entrada imediata em stock`,
        fingerprintData: {items, total, supplierId: payload.supplierId ?? null},
      };
    }

    if (operation === "open_cash_session") {
      const registerId = String(payload.registerId);
      const {data: register, error} = await supabase
        .from("cash_registers")
        .select("id,name")
        .eq("store_id", context.tenantId)
        .eq("id", registerId)
        .maybeSingle();
      if (error || !register) throw new ConfirmationError("invalid_intent");
      const openingAmount = Number(payload.openingAmount ?? 0);
      return {
        summary: `Abrir caixa ${register.name} com saldo inicial de ${money.format(openingAmount)}`,
        fingerprintData: {registerId: register.id, openingAmount},
      };
    }

    if (operation === "close_cash_session") {
      const sessionId = String(payload.sessionId);
      const {data: session, error} = await supabase
        .from("cash_sessions")
        .select("id,register_id,opening_amount")
        .eq("store_id", context.tenantId)
        .eq("id", sessionId)
        .maybeSingle();
      if (error || !session) throw new ConfirmationError("invalid_intent");
      const countedAmount = Number(payload.countedAmount ?? 0);
      return {
        summary: `Fechar sessão de caixa com valor contado de ${money.format(countedAmount)}`,
        fingerprintData: {sessionId: session.id, countedAmount},
      };
    }

    if (operation === "register_expense") {
      const sessionId = String(payload.sessionId);
      const {data: session, error} = await supabase
        .from("cash_sessions")
        .select("id")
        .eq("store_id", context.tenantId)
        .eq("id", sessionId)
        .maybeSingle();
      if (error || !session) throw new ConfirmationError("invalid_intent");
      const amount = Number(payload.amount ?? 0);
      const description = String(payload.description ?? "").trim();
      return {
        summary: `Registar despesa "${description}" de ${money.format(amount)}`,
        fingerprintData: {sessionId: session.id, amount, description, category: payload.category ?? ""},
      };
    }

    throw new ConfirmationError("invalid_intent");
  };
}

export function createDomainConfirmedExecutor(requestId?: string): ConfirmedOperationExecutor {
  return async (context, operation, payload, idempotencyKey) => {
    const toolContext: ToolContext = {
      storeId: context.tenantId,
      userId: context.userId,
      requestId,
    };

    switch (operation) {
      case "create_sale":
        return createSale(toolContext, {
          items: payload.items as {productId: string; quantity: number}[],
          paymentMethod: payload.paymentMethod as "cash" | "bank_transfer" | "multicaixa_reference" | "multicaixa_express" | "other",
          paidAmount: Number(payload.paidAmount),
          customerId: payload.customerId ? String(payload.customerId) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          idempotencyKey,
        });
      case "create_purchase":
        return createPurchase(toolContext, {
          items: payload.items as {productId: string; quantity: number; unitCost: number}[],
          supplierId: payload.supplierId ? String(payload.supplierId) : undefined,
          supplierReference: payload.supplierReference ? String(payload.supplierReference) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          idempotencyKey,
        });
      case "open_cash_session":
        return openCashSession(toolContext, {
          registerId: String(payload.registerId),
          openingAmount: Number(payload.openingAmount),
          notes: payload.notes ? String(payload.notes) : undefined,
          idempotencyKey,
        });
      case "close_cash_session":
        return closeCashSession(toolContext, {
          sessionId: String(payload.sessionId),
          countedAmount: Number(payload.countedAmount),
          notes: payload.notes ? String(payload.notes) : undefined,
          idempotencyKey,
        });
      case "register_expense":
        return registerExpense(toolContext, {
          sessionId: String(payload.sessionId),
          description: String(payload.description),
          category: payload.category ? String(payload.category) : undefined,
          amount: Number(payload.amount),
          notes: payload.notes ? String(payload.notes) : undefined,
          idempotencyKey,
        });
      default:
        return failure("VALIDATION", "Operação não suportada.");
    }
  };
}
