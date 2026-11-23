import {redirect} from "next/navigation";
import {AssistantWhatsAppPanel} from "@/components/assistant-whatsapp-panel";
import {WorkspaceShell} from "@/components/workspace-shell";
import {resolveConfiguredAssistantProviders} from "@/lib/domain/assistant-providers.server";
import {DAILY_AI_STORE_BUDGET} from "@/lib/domain/assistant-rate-limit.server";
import {getTodayAiUsageCount} from "@/lib/domain/assistant-usage.server";
import {isSupabaseConfigured} from "@/lib/env";
import {isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {createClient} from "@/lib/supabase/server";
import {getBaileysWhatsAppRuntime, type BaileysSnapshot} from "@/lib/whatsapp/baileys-runtime.server";

type Props = {searchParams: Promise<{store?: string}>};

export default async function AssistantPage({searchParams}: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {data: memberships} = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (!memberships?.length) redirect("/onboarding");

  const selected = memberships.find((m) => m.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  const canManage = ["owner", "admin", "manager"].includes(selected.role);

  const [
    {data: store},
    {data: connections},
    {data: conversations},
    {data: products},
    dailyUsed,
  ] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    canManage
      ? supabase
          .from("whatsapp_connections")
          .select("id,provider,phone_e164,connection_status,last_connected_at")
          .eq("store_id", storeId)
          .order("created_at")
      : Promise.resolve({data: []}),
    canManage
      ? supabase
          .from("whatsapp_conversations")
          .select("id,connection_id,wa_contact,contact_name,last_message_at")
          .eq("store_id", storeId)
          .order("last_message_at", {ascending: false})
          .limit(12)
      : Promise.resolve({data: []}),
    supabase
      .from("products")
      .select("id,name,sale_price")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("name")
      .limit(50),
    getTodayAiUsageCount(storeId),
  ]);

  const firstConversationId = conversations?.[0]?.id ?? null;
  const {data: messages} =
    canManage && firstConversationId
      ? await supabase
          .from("whatsapp_messages")
          .select("id,direction,body,delivery_status,sent_at,created_at")
          .eq("store_id", storeId)
          .eq("conversation_id", firstConversationId)
          .order("created_at", {ascending: true})
          .limit(30)
      : {data: []};

  const providers = resolveConfiguredAssistantProviders();
  const runtime = getBaileysWhatsAppRuntime();
  const initialSnapshots: Record<string, BaileysSnapshot> = {};
  for (const conn of connections ?? []) {
    const provider = conn.provider === "baileys" ? "baileys" : "sandbox";
    initialSnapshots[conn.id] = runtime.getSnapshot(
      storeId,
      conn.id,
      provider,
      conn.connection_status,
      conn.phone_e164,
    );
  }

  return (
    <WorkspaceShell
      active="assistant"
      sectionTitle="Assistente IA e WhatsApp"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <AssistantWhatsAppPanel
        storeId={storeId}
        storeName={store?.name ?? "A tua loja"}
        role={selected.role}
        initialHealth={{
          mode: providers.mode,
          primaryProvider: providers.primaryProvider,
          primaryModel: providers.primaryModel,
          geminiConfigured: providers.geminiConfigured,
          fallbackConfigured: providers.fallbackConfigured,
          fallbackModel: providers.fallbackModel ?? null,
          supabaseConfigured: isSupabaseConfigured(),
          supabaseAdminConfigured: isSupabaseAdminConfigured(),
          credentialKeyringConfigured: Boolean(
            process.env.WHATSAPP_CREDENTIALS_ACTIVE_KEY_VERSION?.trim()
            && process.env.WHATSAPP_CREDENTIALS_KEYRING?.trim(),
          ),
          dailyBudget: DAILY_AI_STORE_BUDGET,
          dailyUsed,
        }}
        initialConnections={(connections ?? []).map((c) => ({
          id: c.id,
          provider: c.provider,
          phone_e164: c.phone_e164,
          connection_status: c.connection_status,
          last_connected_at: c.last_connected_at,
        }))}
        initialSnapshots={initialSnapshots}
        initialConversations={conversations ?? []}
        initialMessages={messages ?? []}
        products={(products ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          sale_price: Number(p.sale_price ?? 0),
        }))}
      />
    </WorkspaceShell>
  );
}
