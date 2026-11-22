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

const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Indica o teu nome completo (mínimo 2 caracteres).")
    .max(120, "O nome é demasiado longo."),
  email: z.string().trim().email("Indica um endereço de email válido."),
  password: z
    .string()
    .min(10, "A palavra-passe deve ter pelo menos 10 caracteres.")
    .max(256),
});

export async function POST(request: NextRequest) {
  if (!isTrustedSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origem do pedido inválida." }, { status: 403 });
  }

  const origin = getSafePublicOrigin(request);
  const { isJson, body } = await readAuthPayload(request);

  const fail = (status: number, error: string, code: string, needsVerification = false) => {
    if (isJson) {
      return NextResponse.json({ ok: false, error, needsVerification }, { status });
    }
    return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(code)}`, origin), 303);
  };

  const parsed = registerSchema.safeParse({
    fullName: body.fullName ?? "",
    email: body.email ?? "",
    password: body.password ?? "",
  });

  if (!parsed.success) {
    return fail(
      400,
      parsed.error.issues[0]?.message ?? "Verifica os dados do formulário.",
      "invalid-input",
    );
  }

  const { supabase, applyCookies } = await createRouteClient(request);
  const normalizedEmail = parsed.data.email.toLowerCase();
  const emailRedirectTo = `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    const mapped = mapAuthErrorMessage(error.message);
    return fail(400, mapped.text, "register-failed", mapped.needsVerification);
  }

  // Supabase returns an empty identities array instead of an error when email confirmation is enabled
  // and the email already exists in auth.users.
  if (
    isSupabaseConfigured() &&
    data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0
  ) {
    return fail(
      409,
      "Já existe uma conta associada a este email. Inicia sessão ou reenvia o email de confirmação.",
      "already-registered",
      true,
    );
  }

  if (!data.session) {
    const notice =
      "Conta criada! Enviámos um link de verificação para o teu email. Confirma a tua caixa de entrada (e o spam) antes de iniciar sessão.";
    if (isJson) {
      return applyCookies(
        NextResponse.json({
          ok: true,
          needsVerification: true,
          email: normalizedEmail,
          notice,
        }),
      );
    }
    return applyCookies(NextResponse.redirect(new URL("/register?notice=verify-email", origin), 303));
  }

  if (isJson) {
    return applyCookies(
      NextResponse.json({
        ok: true,
        mode: isSupabaseConfigured() ? "supabase" : "sandbox",
        redirectTo: "/onboarding",
      }),
    );
  }

  return applyCookies(NextResponse.redirect(new URL("/onboarding", origin), 303));
}
