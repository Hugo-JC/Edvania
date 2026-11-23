import {NextRequest, NextResponse} from "next/server";
import {isSupabaseConfigured} from "@/lib/env";
import {resolveConfiguredAssistantProviders} from "@/lib/domain/assistant-providers.server";
import {DAILY_AI_STORE_BUDGET} from "@/lib/domain/assistant-rate-limit.server";
import {getTodayAiUsageCount} from "@/lib/domain/assistant-usage.server";
import {isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {createRouteClient} from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const {supabase} = await createRouteClient(request);
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({error: "unauthorized"}, {status: 401});
  }

  const {data: memberships} = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!memberships?.length) {
    return NextResponse.json({error: "no_active_store"}, {status: 403});
  }

  const requestedStoreId = request.nextUrl.searchParams.get("store");
  const selected = memberships.find((m) => m.store_id === requestedStoreId) ?? memberships[0];
  const canManage = ["owner", "admin", "manager"].includes(selected.role);
  const doProbe = request.nextUrl.searchParams.get("probe") === "1";

  const providers = resolveConfiguredAssistantProviders();
  const dailyUsed = await getTodayAiUsageCount(selected.store_id);
  const credentialKeyringConfigured = Boolean(
    process.env.WHATSAPP_CREDENTIALS_ACTIVE_KEY_VERSION?.trim()
    && process.env.WHATSAPP_CREDENTIALS_KEYRING?.trim(),
  );

  let probe:
    | {
        ok: boolean;
        latencyMs: number;
        sampleText?: string;
        error?: string;
      }
    | undefined;

  if (doProbe) {
    if (!canManage) {
      return NextResponse.json({error: "forbidden"}, {status: 403});
    }
    const startMs = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const raw = (await providers.primary.generate(
        {
          userMessage: "Responde exatamente numa frase curta: Edvânia pronta para atender.",
          toolResults: [],
          allowedTools: [],
          allowToolCalls: false,
          maxOutputTokens: 512,
        },
        controller.signal,
      )) as {text?: unknown} | null;
      const sampleText = typeof raw?.text === "string" ? raw.text.trim().slice(0, 200) : "";
      probe = {
        ok: Boolean(sampleText),
        latencyMs: Date.now() - startMs,
        sampleText,
      };
    } catch (error) {
      probe = {
        ok: false,
        latencyMs: Date.now() - startMs,
        error: error instanceof Error ? error.message.slice(0, 140) : "probe_failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      storeId: selected.store_id,
      role: selected.role,
      mode: providers.mode,
      primaryProvider: providers.primaryProvider,
      primaryModel: providers.primaryModel,
      geminiConfigured: providers.geminiConfigured,
      fallbackConfigured: providers.fallbackConfigured,
      fallbackModel: providers.fallbackModel ?? null,
      supabaseConfigured: isSupabaseConfigured(),
      supabaseAdminConfigured: isSupabaseAdminConfigured(),
      credentialKeyringConfigured,
      dailyBudget: DAILY_AI_STORE_BUDGET,
      dailyUsed,
      ...(probe ? {probe} : {}),
    },
    {headers: {"Cache-Control": "no-store, max-age=0"}},
  );
}
