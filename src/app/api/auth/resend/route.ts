import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import {
  getSafePublicOrigin,
  isTrustedSameOrigin,
  mapAuthErrorMessage,
  readAuthPayload,
} from "@/lib/supabase/auth-helpers";
import { createRouteClient } from "@/lib/supabase/server";

const resendSchema = z.object({
  email: z.string().trim().email("Indica o endereço de email para reenviar a confirmação."),
});

export async function POST(request: NextRequest) {
  if (!isTrustedSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origem do pedido inválida." }, { status: 403 });
  }

  const { body } = await readAuthPayload(request);
  const parsed = resendSchema.safeParse({ email: body.email ?? "" });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Email inválido." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      mode: "sandbox",
      notice:
        "Neste ambiente de pré-visualização local o envio real de emails está desactivado. Podes iniciar sessão directamente.",
    });
  }

  const origin = getSafePublicOrigin(request);
  const { supabase } = await createRouteClient(request);

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email.toLowerCase(),
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    const mapped = mapAuthErrorMessage(error.message);
    return NextResponse.json({ ok: false, error: mapped.text }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    notice:
      "Reenviámos o email de confirmação. Verifica a caixa de entrada e a pasta de spam nos próximos minutos.",
  });
}
