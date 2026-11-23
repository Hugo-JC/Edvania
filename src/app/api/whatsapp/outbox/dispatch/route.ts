import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {isSupabaseConfigured} from "@/lib/env";
import {createClient} from "@/lib/supabase/server";
import {createServerWhatsAppOutboxStore} from "@/lib/whatsapp/outbox-store.server";
import {dispatchOutboxBatch} from "@/lib/whatsapp/outbox-worker";
import {getBaileysWhatsAppRuntime} from "@/lib/whatsapp/baileys-runtime.server";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";
import {verifyBearerSecret} from "@/lib/whatsapp/webhook-auth";

const bodySchema = z.object({
  storeId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const workerAuthorized = verifyBearerSecret(
    request.headers.get("authorization"),
    process.env.WHATSAPP_WORKER_SECRET,
  );

  let authenticatedUserId: string | null = null;
  let supabaseClient: Awaited<ReturnType<typeof createClient>> | null = null;
  if (!workerAuthorized) {
    supabaseClient = await createClient();
    const {data: {user}} = await supabaseClient.auth.getUser();
    if (!user) {
      return NextResponse.json({error: "unauthorized"}, {status: 401});
    }
    authenticatedUserId = user.id;
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

  const {storeId, limit = 10} = parsed.data;
  let leaseOwner = "worker-bearer";
  if (!workerAuthorized && supabaseClient && authenticatedUserId) {
    const {data: membership} = await supabaseClient
      .from("store_memberships")
      .select("role")
      .eq("store_id", storeId)
      .eq("user_id", authenticatedUserId)
      .eq("status", "active")
      .maybeSingle();
    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      return NextResponse.json({error: "forbidden"}, {status: 403});
    }
    leaseOwner = `operator-${authenticatedUserId.slice(0, 8)}`;
  }

  const runtime = getSandboxWhatsAppRuntime();
  try {
    const store = isSupabaseConfigured() && process.env.SUPABASE_SECRET_KEY?.trim()
      ? createServerWhatsAppOutboxStore()
      : runtime.createMockOutboxStore();

    const result = await dispatchOutboxBatch(
      storeId,
      leaseOwner,
      store,
      getBaileysWhatsAppRuntime().createUnifiedOutboxSender(),
      {limit, leaseSeconds: 60},
    );

    const summary = result.outcomes.reduce<Record<string, number>>((acc, outcome) => {
      acc[outcome.status] = (acc[outcome.status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      claimed: result.claimed,
      summary,
    });
  } catch {
    return NextResponse.json({error: "dispatch_failed"}, {status: 500});
  }
}
