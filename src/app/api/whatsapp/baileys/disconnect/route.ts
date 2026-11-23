import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {createRouteClient} from "@/lib/supabase/server";
import {authorizeWhatsAppManagerRoute} from "@/lib/whatsapp/baileys-auth-route.server";
import {getBaileysWhatsAppRuntime} from "@/lib/whatsapp/baileys-runtime.server";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";

const disconnectSchema = z.object({
  storeId: z.string().uuid(),
  connectionId: z.string().uuid(),
  logout: z.boolean().default(false),
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

  const parsed = disconnectSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({error: "invalid_request"}, {status: 400});
  }

  const auth = await authorizeWhatsAppManagerRoute(request, parsed.data.storeId);
  if (!auth.ok) return auth.response;

  const {data: connection} = await auth.supabase
    .from("whatsapp_connections")
    .select("id,provider")
    .eq("store_id", auth.storeId)
    .eq("id", parsed.data.connectionId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({error: "unknown_connection"}, {status: 404});
  }

  if (connection.provider === "sandbox") {
    await getSandboxWhatsAppRuntime().disconnect(auth.storeId, connection.id, parsed.data.logout);
    const snapshot = getBaileysWhatsAppRuntime().getSnapshot(auth.storeId, connection.id, "sandbox");
    return NextResponse.json({ok: true, snapshot});
  }

  const snapshot = await getBaileysWhatsAppRuntime().disconnect(
    auth.storeId,
    connection.id,
    parsed.data.logout,
  );
  return NextResponse.json({ok: true, snapshot});
}
