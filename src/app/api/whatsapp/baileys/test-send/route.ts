import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {runStoreAssistantConversation} from "@/lib/domain/assistant-orchestration.server";
import type {StoreRole} from "@/lib/domain/contracts";
import {createRouteClient} from "@/lib/supabase/server";
import {authorizeWhatsAppManagerRoute} from "@/lib/whatsapp/baileys-auth-route.server";
import {getBaileysWhatsAppRuntime} from "@/lib/whatsapp/baileys-runtime.server";
import {normalizeAngolaOrE164Phone} from "@/lib/whatsapp/baileys-utils";
import {WhatsAppSendError} from "@/lib/whatsapp/provider";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";

const testSendSchema = z.object({
  storeId: z.string().uuid(),
  connectionId: z.string().uuid(),
  mode: z.enum(["live_send", "sandbox_inbound"]),
  recipientPhone: z.string().trim().min(6).max(24),
  contactName: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(1000),
  useAiResponse: z.boolean().default(false),
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

  const parsed = testSendSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({error: "Dados inválidos para o teste de WhatsApp."}, {status: 400});
  }

  const auth = await authorizeWhatsAppManagerRoute(request, parsed.data.storeId);
  if (!auth.ok) return auth.response;

  const phone = normalizeAngolaOrE164Phone(parsed.data.recipientPhone);
  if (!phone) {
    return NextResponse.json(
      {error: "Número de destinatário inválido. Usa formato Angola/E.164 (ex.: 923000111 ou +244923000111)."},
      {status: 400},
    );
  }

  if (parsed.data.mode === "sandbox_inbound") {
    try {
      const result = await getSandboxWhatsAppRuntime().simulateInboundAndReply({
        storeId: auth.storeId,
        userId: auth.userId,
        connectionId: parsed.data.connectionId,
        senderJid: phone.jid,
        contactName: parsed.data.contactName || "Teste Guiado",
        body: parsed.data.message,
      });
      return NextResponse.json({
        ok: true,
        mode: "sandbox_inbound",
        replyText: result.replyText,
        outboxStatus: result.outboxStatus,
      });
    } catch {
      return NextResponse.json(
        {error: "Não foi possível concluir o teste inbound com o assistente."},
        {status: 500},
      );
    }
  }

  let outgoingText = parsed.data.message;
  let aiMeta: {model?: string; provider?: string; toolsUsed?: readonly string[]} | undefined;

  if (parsed.data.useAiResponse) {
    const turn = await runStoreAssistantConversation({
      storeId: auth.storeId,
      userId: auth.userId,
      role: auth.role as StoreRole,
      message: parsed.data.message,
      taskType: "whatsapp_baileys_first_test",
    });
    if (!turn.result.ok) {
      return NextResponse.json(
        {error: `Falha no modelo de IA antes do envio: ${turn.result.error.message}`},
        {status: 503},
      );
    }
    outgoingText = turn.result.data.text;
    aiMeta = {
      model: turn.model,
      provider: turn.provider,
      toolsUsed: turn.toolsUsed,
    };
  }

  try {
    const sent = await getBaileysWhatsAppRuntime().sendText(
      auth.storeId,
      parsed.data.connectionId,
      phone.jid,
      outgoingText,
    );
    return NextResponse.json({
      ok: true,
      mode: "live_send",
      sentText: outgoingText,
      providerMessageId: sent.providerMessageId,
      status: sent.status,
      ...(aiMeta ? {ai: aiMeta} : {}),
    });
  } catch (error) {
    if (error instanceof WhatsAppSendError && error.code === "session_not_connected") {
      return NextResponse.json(
        {
          error:
            "A sessão Baileys ainda não está ligada ao telemóvel. Lê primeiro o QR Code com o WhatsApp ou executa o Teste Guiado com IA (Sandbox).",
        },
        {status: 409},
      );
    }
    return NextResponse.json(
      {error: "Não foi possível enviar a mensagem pelo WhatsApp neste momento."},
      {status: 502},
    );
  }
}
