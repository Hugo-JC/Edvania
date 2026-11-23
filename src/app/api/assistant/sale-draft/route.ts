import {randomUUID} from "node:crypto";
import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {prepareOperationConfirmation} from "@/lib/domain/confirmations";
import {confirmOperationWithRecovery} from "@/lib/domain/confirmations-recovery";
import {
  createDomainConfirmedExecutor,
  createDomainOperationPreviewer,
  getSharedConfirmationDraftStore,
  getSharedConfirmationRecoveryStore,
  getSharedConfirmationStore,
} from "@/lib/domain/confirmations.server";
import {createRouteClient} from "@/lib/supabase/server";

const prepareSchema = z.object({
  action: z.literal("prepare_sale"),
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.coerce.number().finite().positive().max(10_000),
  paidAmount: z.coerce.number().finite().min(0).max(1_000_000_000),
  paymentMethod: z.enum(["cash", "bank_transfer", "multicaixa_reference", "multicaixa_express", "other"]),
}).strict();

const resolveSchema = z.object({
  action: z.enum(["confirm", "cancel"]),
  storeId: z.string().uuid(),
  draftId: z.string().uuid(),
}).strict();

const bodySchema = z.discriminatedUnion("action", [prepareSchema, resolveSchema]);

export async function POST(request: NextRequest) {
  const {supabase} = await createRouteClient(request);
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({error: "unauthorized"}, {status: 401});
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({error: "invalid_json"}, {status: 400});
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({error: "invalid_request"}, {status: 400});
  }

  const {storeId} = parsed.data;
  const {data: membership} = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
    return NextResponse.json({error: "forbidden"}, {status: 403});
  }

  const draftStore = getSharedConfirmationDraftStore();

  if (parsed.data.action === "prepare_sale") {
    const context = {
      tenantId: storeId,
      userId: user.id,
      conversationId: storeId,
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
      draftStore.save({
        draftId,
        context,
        operation: prepared.operation,
        input,
        token: prepared.token,
        summary: prepared.summary,
        expiresAt: prepared.expiresAt,
      });
      return NextResponse.json({
        ok: true,
        draft: {
          draftId,
          summary: prepared.summary,
          expiresAt: prepared.expiresAt,
        },
      });
    } catch {
      return NextResponse.json(
        {ok: false, error: "Não foi possível preparar a pré-visualização da venda."},
        {status: 400},
      );
    }
  }

  if (parsed.data.action === "cancel") {
    draftStore.deleteForContext(parsed.data.draftId, storeId, user.id);
    return NextResponse.json({ok: true, cancelled: true});
  }

  const draft = draftStore.getForContext(parsed.data.draftId, storeId, user.id);
  if (!draft) {
    return NextResponse.json(
      {ok: false, error: "Pré-visualização expirada ou inexistente. Prepara uma nova operação."},
      {status: 410},
    );
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
    draftStore.deleteForContext(parsed.data.draftId, storeId, user.id);
    if (!result.ok) {
      return NextResponse.json({ok: false, error: result.error.message}, {status: 400});
    }
    return NextResponse.json({ok: true, confirmed: true, summary: draft.summary});
  } catch {
    draftStore.deleteForContext(parsed.data.draftId, storeId, user.id);
    return NextResponse.json(
      {ok: false, error: "Não foi possível confirmar a venda assistida."},
      {status: 500},
    );
  }
}
