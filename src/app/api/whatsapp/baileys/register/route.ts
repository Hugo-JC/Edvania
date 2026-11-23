import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {createRouteClient} from "@/lib/supabase/server";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import {authorizeWhatsAppManagerRoute} from "@/lib/whatsapp/baileys-auth-route.server";
import {normalizeAngolaOrE164Phone} from "@/lib/whatsapp/baileys-utils";

const registerSchema = z.object({
  storeId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  phone: z.string().trim().min(7).max(24),
  provider: z.enum(["baileys", "sandbox"]).default("baileys"),
}).strict();

export async function POST(request: NextRequest) {
  const {supabase: sessionClient} = await createRouteClient(request);
  const {data: {user}} = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({error: "unauthorized"}, {status: 401});
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({error: "invalid_json"}, {status: 400});
  }

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({error: "invalid_request"}, {status: 400});
  }

  const auth = await authorizeWhatsAppManagerRoute(request, parsed.data.storeId);
  if (!auth.ok) return auth.response;

  const phone = normalizeAngolaOrE164Phone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      {error: "Número inválido. Usa o formato E.164 ou Angola (ex.: +244923000111 ou 923000111)."},
      {status: 400},
    );
  }

  const writer = getSupabaseAdminClient() ?? auth.supabase;
  const now = new Date().toISOString();

  if (parsed.data.connectionId) {
    const {data, error} = await writer
      .from("whatsapp_connections")
      .update({
        phone_e164: phone.e164,
        provider: parsed.data.provider,
        updated_at: now,
      })
      .eq("store_id", auth.storeId)
      .eq("id", parsed.data.connectionId)
      .select("id,provider,phone_e164,connection_status,last_connected_at")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({error: "Não foi possível actualizar o canal WhatsApp."}, {status: 400});
    }
    return NextResponse.json({ok: true, connection: data});
  }

  const {data: existing} = await writer
    .from("whatsapp_connections")
    .select("id")
    .eq("store_id", auth.storeId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (existing && parsed.data.provider === "baileys") {
    const {data, error} = await writer
      .from("whatsapp_connections")
      .update({
        phone_e164: phone.e164,
        provider: "baileys",
        updated_at: now,
      })
      .eq("store_id", auth.storeId)
      .eq("id", existing.id)
      .select("id,provider,phone_e164,connection_status,last_connected_at")
      .single();

    if (error || !data) {
      return NextResponse.json({error: "Não foi possível registar o número WhatsApp."}, {status: 400});
    }
    return NextResponse.json({ok: true, connection: data});
  }

  const {data, error} = await writer
    .from("whatsapp_connections")
    .insert({
      store_id: auth.storeId,
      provider: parsed.data.provider,
      phone_e164: phone.e164,
      connection_status: "disconnected",
    })
    .select("id,provider,phone_e164,connection_status,last_connected_at")
    .single();

  if (error || !data) {
    return NextResponse.json({error: "Não foi possível criar a ligação WhatsApp."}, {status: 400});
  }

  return NextResponse.json({ok: true, connection: data});
}
