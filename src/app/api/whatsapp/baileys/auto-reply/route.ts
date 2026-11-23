import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {createRouteClient} from "@/lib/supabase/server";
import {authorizeWhatsAppManagerRoute} from "@/lib/whatsapp/baileys-auth-route.server";
import {getBaileysWhatsAppRuntime} from "@/lib/whatsapp/baileys-runtime.server";

const toggleSchema = z.object({
  storeId: z.string().uuid(),
  connectionId: z.string().uuid(),
  enabled: z.boolean(),
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

  const parsed = toggleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({error: "invalid_request"}, {status: 400});
  }

  const auth = await authorizeWhatsAppManagerRoute(request, parsed.data.storeId);
  if (!auth.ok) return auth.response;

  const autoReplyEnabled = getBaileysWhatsAppRuntime().setAutoReply(
    auth.storeId,
    parsed.data.connectionId,
    parsed.data.enabled,
  );

  return NextResponse.json({ok: true, autoReplyEnabled});
}
