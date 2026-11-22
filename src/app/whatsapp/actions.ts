"use server";

import {redirect} from "next/navigation";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";

const uuid = z.string().uuid();

async function authorizeWhatsAppOperator(storeId: string) {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {data: membership} = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return {supabase, user};
}

export async function connectSandboxSession(formData: FormData) {
  const parsed = z.object({storeId: uuid, connectionId: uuid}).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  await runtime.connect(parsed.data.storeId, parsed.data.connectionId);
  redirect(`/whatsapp?store=${parsed.data.storeId}&notice=qr`);
}

export async function confirmSandboxSession(formData: FormData) {
  const parsed = z.object({storeId: uuid, connectionId: uuid}).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  runtime.confirmPairing(parsed.data.storeId, parsed.data.connectionId);
  redirect(`/whatsapp?store=${parsed.data.storeId}&notice=connected`);
}

export async function disconnectSandboxSession(formData: FormData) {
  const parsed = z.object({
    storeId: uuid,
    connectionId: uuid,
    logout: z.enum(["true", "false"]).optional(),
  }).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
    logout: formData.get("logout") ?? "false",
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  await runtime.disconnect(parsed.data.storeId, parsed.data.connectionId, parsed.data.logout === "true");
  redirect(`/whatsapp?store=${parsed.data.storeId}&notice=disconnected`);
}

export async function simulateInboundSandboxMessage(formData: FormData) {
  const parsed = z.object({
    storeId: uuid,
    connectionId: uuid,
    senderPhone: z.string().trim().regex(/^[0-9]{6,15}$/),
    contactName: z.string().trim().max(100).optional(),
    body: z.string().trim().min(1).max(1000),
  }).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
    senderPhone: formData.get("senderPhone"),
    contactName: formData.get("contactName") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    const storeId = String(formData.get("storeId") ?? "");
    redirect(uuid.safeParse(storeId).success ? `/whatsapp?store=${storeId}&error=invalid-message` : "/dashboard");
  }

  const {user} = await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  try {
    const result = await runtime.simulateInboundAndReply({
      storeId: parsed.data.storeId,
      userId: user.id,
      connectionId: parsed.data.connectionId,
      senderJid: `${parsed.data.senderPhone}@s.whatsapp.net`,
      contactName: parsed.data.contactName,
      body: parsed.data.body,
    });
    redirect(`/whatsapp?store=${parsed.data.storeId}&notice=simulated&outbox=${result.outboxStatus}`);
  } catch {
    redirect(`/whatsapp?store=${parsed.data.storeId}&error=simulation-failed`);
  }
}

export async function dispatchPendingOutbox(formData: FormData) {
  const parsed = z.object({storeId: uuid}).safeParse({
    storeId: formData.get("storeId"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  const {user} = await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  const {isSupabaseConfigured} = await import("@/lib/env");
  const {createServerWhatsAppOutboxStore} = await import("@/lib/whatsapp/outbox-store.server");
  const {dispatchOutboxBatch} = await import("@/lib/whatsapp/outbox-worker");

  try {
    const store = isSupabaseConfigured() && process.env.SUPABASE_SECRET_KEY?.trim()
      ? createServerWhatsAppOutboxStore()
      : runtime.createMockOutboxStore();

    const batch = await dispatchOutboxBatch(
      parsed.data.storeId,
      `operator-${user.id.slice(0, 8)}`,
      store,
      runtime.createOutboxSender(),
      {limit: 20, leaseSeconds: 60},
    );
    redirect(`/whatsapp?store=${parsed.data.storeId}&notice=dispatched&claimed=${batch.claimed}`);
  } catch {
    redirect(`/whatsapp?store=${parsed.data.storeId}&error=dispatch-failed`);
  }
}

export async function prepareAssistedSale(formData: FormData) {
  const parsed = z.object({
    storeId: uuid,
    conversationId: uuid.optional(),
    productId: uuid,
    quantity: z.coerce.number().finite().positive().max(10_000),
    paidAmount: z.coerce.number().finite().min(0).max(1_000_000_000),
    paymentMethod: z.enum(["cash", "bank_transfer", "multicaixa_reference", "multicaixa_express", "other"]),
  }).safeParse({
    storeId: formData.get("storeId"),
    conversationId: formData.get("conversationId") || undefined,
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    paidAmount: formData.get("paidAmount"),
    paymentMethod: formData.get("paymentMethod") ?? "cash",
  });

  if (!parsed.success) {
    const storeId = String(formData.get("storeId") ?? "");
    redirect(uuid.safeParse(storeId).success ? `/whatsapp?store=${storeId}&error=invalid-preview` : "/dashboard");
  }

  const {supabase, user} = await authorizeWhatsAppOperator(parsed.data.storeId);
  const {randomUUID} = await import("node:crypto");
  const {prepareOperationConfirmation} = await import("@/lib/domain/confirmations");
  const {
    createDomainOperationPreviewer,
    getSharedConfirmationDraftStore,
    getSharedConfirmationStore,
  } = await import("@/lib/domain/confirmations.server");

  const context = {
    tenantId: parsed.data.storeId,
    userId: user.id,
    conversationId: parsed.data.conversationId ?? parsed.data.storeId,
  };
  const input = {
    items: [{productId: parsed.data.productId, quantity: parsed.data.quantity}],
    paymentMethod: parsed.data.paymentMethod,
    paidAmount: parsed.data.paidAmount,
  };

  try {
    const prepared = await prepareOperationConfirmation(
      context,
      "create_sale",
      input,
      createDomainOperationPreviewer(supabase),
      getSharedConfirmationStore(),
      {ttlMs: 5 * 60 * 1000},
    );
    const draftId = randomUUID();
    getSharedConfirmationDraftStore().save({
      draftId,
      context,
      operation: prepared.operation,
      input,
      token: prepared.token,
      summary: prepared.summary,
      expiresAt: prepared.expiresAt,
    });
    redirect(`/whatsapp?store=${parsed.data.storeId}&draft=${draftId}`);
  } catch {
    redirect(`/whatsapp?store=${parsed.data.storeId}&error=invalid-preview`);
  }
}

export async function confirmAssistedOperation(formData: FormData) {
  const parsed = z.object({storeId: uuid, draftId: uuid}).safeParse({
    storeId: formData.get("storeId"),
    draftId: formData.get("draftId"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  const {supabase, user} = await authorizeWhatsAppOperator(parsed.data.storeId);
  const {confirmOperationWithRecovery} = await import("@/lib/domain/confirmations-recovery");
  const {
    createDomainConfirmedExecutor,
    createDomainOperationPreviewer,
    getSharedConfirmationDraftStore,
    getSharedConfirmationRecoveryStore,
    getSharedConfirmationStore,
  } = await import("@/lib/domain/confirmations.server");

  const draftStore = getSharedConfirmationDraftStore();
  const draft = draftStore.getForContext(parsed.data.draftId, parsed.data.storeId, user.id);
  if (!draft) {
    redirect(`/whatsapp?store=${parsed.data.storeId}&error=confirm-expired`);
  }

  try {
    const result = await confirmOperationWithRecovery(
      draft.context,
      draft.operation,
      draft.input,
      draft.token,
      createDomainOperationPreviewer(supabase),
      getSharedConfirmationStore(),
      createDomainConfirmedExecutor(),
      getSharedConfirmationRecoveryStore(),
    );
    draftStore.deleteForContext(parsed.data.draftId, parsed.data.storeId, user.id);
    if (!result.ok) {
      redirect(`/whatsapp?store=${parsed.data.storeId}&error=confirm-failed`);
    }
    redirect(`/whatsapp?store=${parsed.data.storeId}&notice=confirmed`);
  } catch {
    draftStore.deleteForContext(parsed.data.draftId, parsed.data.storeId, user.id);
    redirect(`/whatsapp?store=${parsed.data.storeId}&error=confirm-failed`);
  }
}

export async function cancelAssistedOperation(formData: FormData) {
  const parsed = z.object({storeId: uuid, draftId: uuid}).safeParse({
    storeId: formData.get("storeId"),
    draftId: formData.get("draftId"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  const {user} = await authorizeWhatsAppOperator(parsed.data.storeId);
  const {getSharedConfirmationDraftStore} = await import("@/lib/domain/confirmations.server");
  getSharedConfirmationDraftStore().deleteForContext(parsed.data.draftId, parsed.data.storeId, user.id);
  redirect(`/whatsapp?store=${parsed.data.storeId}&notice=cancelled`);
}

