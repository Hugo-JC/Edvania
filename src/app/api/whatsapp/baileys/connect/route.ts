import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {createRouteClient} from "@/lib/supabase/server";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import {authorizeWhatsAppManagerRoute} from "@/lib/whatsapp/baileys-auth-route.server";
import {getBaileysWhatsAppRuntime} from "@/lib/whatsapp/baileys-runtime.server";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";

const connectSchema = z.object({
  storeId: z.string().uuid(),
  connectionId: z.string().uuid(),
  mode: z.enum(["baileys", "sandbox"]).default("baileys"),
  confirmSandbox: z.boolean().optional(),
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

  const parsed = connectSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({error: "invalid_request"}, {status: 400});
  }

  const auth = await authorizeWhatsAppManagerRoute(request, parsed.data.storeId);
  if (!auth.ok) return auth.response;

  const writer = getSupabaseAdminClient() ?? auth.supabase;
  const {data: connection} = await writer
    .from("whatsapp_connections")
    .select("id,provider,phone_e164")
    .eq("store_id", auth.storeId)
    .eq("id", parsed.data.connectionId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({error: "unknown_connection"}, {status: 404});
  }

  if (parsed.data.mode === "sandbox") {
    const sandbox = getSandboxWhatsAppRuntime();
    if (connection.provider !== "sandbox") {
      await writer
        .from("whatsapp_connections")
        .update({provider: "sandbox", updated_at: new Date().toISOString()})
        .eq("store_id", auth.storeId)
        .eq("id", connection.id);
    }
    if (parsed.data.confirmSandbox) {
      sandbox.confirmPairing(auth.storeId, connection.id);
    } else {
      await sandbox.connect(auth.storeId, connection.id);
    }
    const snapshot = getBaileysWhatsAppRuntime().getSnapshot(
      auth.storeId,
      connection.id,
      "sandbox",
      undefined,
      connection.phone_e164,
    );
    return NextResponse.json({ok: true, snapshot});
  }

  if (connection.provider !== "baileys") {
    await writer
      .from("whatsapp_connections")
      .update({provider: "baileys", updated_at: new Date().toISOString()})
      .eq("store_id", auth.storeId)
      .eq("id", connection.id);
  }

  const snapshot = await getBaileysWhatsAppRuntime().connect(auth.storeId, connection.id);
  return NextResponse.json({ok: true, snapshot});
}
