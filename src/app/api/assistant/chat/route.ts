import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {runStoreAssistantConversation} from "@/lib/domain/assistant-orchestration.server";
import type {StoreRole} from "@/lib/domain/contracts";
import {createRouteClient} from "@/lib/supabase/server";

const chatSchema = z.object({
  storeId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1).max(1200),
      }),
    )
    .max(12)
    .optional(),
}).strict();

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

  const parsed = chatSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({error: "invalid_request"}, {status: 400});
  }

  const {storeId, message, history} = parsed.data;
  const {data: membership} = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({error: "forbidden"}, {status: 403});
  }

  const outcome = await runStoreAssistantConversation({
    storeId,
    userId: user.id,
    role: membership.role as StoreRole,
    message,
    history,
    taskType: "assistant_panel_chat",
  });

  if (!outcome.result.ok) {
    const status =
      outcome.result.error.code === "CONFLICT"
        ? 429
        : outcome.result.error.code === "FORBIDDEN"
          ? 403
          : 503;
    return NextResponse.json(
      {
        ok: false,
        error: outcome.result.error.message,
        errorCode: outcome.errorCode ?? outcome.result.error.code,
        mode: outcome.mode,
        provider: outcome.provider,
        model: outcome.model,
        latencyMs: outcome.latencyMs,
      },
      {status},
    );
  }

  return NextResponse.json(
    {
      ok: true,
      text: outcome.result.data.text,
      mode: outcome.mode,
      provider: outcome.provider,
      model: outcome.model,
      toolsUsed: outcome.toolsUsed,
      latencyMs: outcome.latencyMs,
    },
    {headers: {"Cache-Control": "no-store, max-age=0"}},
  );
}
