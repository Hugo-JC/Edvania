import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {authorizeWhatsAppManagerRoute} from "@/lib/whatsapp/baileys-auth-route.server";
import {getBaileysWhatsAppRuntime, type BaileysSnapshot} from "@/lib/whatsapp/baileys-runtime.server";

export async function GET(request: NextRequest) {
  const storeParam = request.nextUrl.searchParams.get("store");
  if (storeParam && !z.string().uuid().safeParse(storeParam).success) {
    return NextResponse.json({error: "invalid_store"}, {status: 400});
  }

  const auth = await authorizeWhatsAppManagerRoute(request, storeParam);
  if (!auth.ok) return auth.response;

  const {supabase, storeId} = auth;
  const [{data: connections}, conversationsRes, outboxRes] = await Promise.all([
    supabase
      .from("whatsapp_connections")
      .select("id,provider,phone_e164,connection_status,last_connected_at,created_at")
      .eq("store_id", storeId)
      .order("created_at"),
    supabase
      .from("whatsapp_conversations")
      .select("id,connection_id,wa_contact,contact_name,last_message_at")
      .eq("store_id", storeId)
      .order("last_message_at", {ascending: false})
      .limit(12),
    supabase
      .from("whatsapp_outbox")
      .select("id,recipient,body,status,attempts,last_error,updated_at")
      .eq("store_id", storeId)
      .order("created_at", {ascending: false})
      .limit(8),
  ]);

  let conversations = conversationsRes.data;
  if (conversationsRes.error) {
    const fallbackConvs = await supabase
      .from("whatsapp_conversations")
      .select("id,wa_contact,contact_name,last_message_at")
      .eq("store_id", storeId)
      .order("last_message_at", {ascending: false})
      .limit(12);
    conversations = (fallbackConvs.data ?? []).map((c) => ({...c, connection_id: ""}));
  }
  const outboxItems = outboxRes.data ?? [];

  const requestedConvId = request.nextUrl.searchParams.get("conversation");
  const activeConversationId =
    (requestedConvId && conversations?.find((c) => c.id === requestedConvId)?.id)
    ?? conversations?.[0]?.id
    ?? null;

  const {data: messages} = activeConversationId
    ? await supabase
        .from("whatsapp_messages")
        .select("id,direction,body,delivery_status,sent_at,created_at")
        .eq("store_id", storeId)
        .eq("conversation_id", activeConversationId)
        .order("created_at", {ascending: true})
        .limit(30)
    : {data: []};

  const runtime = getBaileysWhatsAppRuntime();
  const snapshots: Record<string, BaileysSnapshot> = {};
  for (const conn of connections ?? []) {
    const provider = conn.provider === "baileys" ? "baileys" : "sandbox";
    snapshots[conn.id] = runtime.getSnapshot(
      storeId,
      conn.id,
      provider,
      conn.connection_status,
      conn.phone_e164,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      storeId,
      connections: connections ?? [],
      snapshots,
      conversations: conversations ?? [],
      activeConversationId,
      messages: messages ?? [],
      outbox: outboxItems ?? [],
    },
    {headers: {"Cache-Control": "no-store, max-age=0"}},
  );
}
