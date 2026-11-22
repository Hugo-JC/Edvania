import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSafePublicOrigin,
  isTrustedSameOrigin,
  mapAuthErrorMessage,
  readAuthPayload,
} from "@/lib/supabase/auth-helpers";
import { createRouteClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email("Indica um endereço de email válido."),
  password: z.string().min(1, "Indica a tua palavra-passe.").max(256),
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
    const target = new URL(`/login?error=${encodeURIComponent(code)}`, origin);
    return NextResponse.redirect(target, 303);
  };

  const parsed = loginSchema.safeParse({
    email: body.email ?? "",
    password: body.password ?? "",
  });

  if (!parsed.success) {
    return fail(
      400,
      parsed.error.issues[0]?.message ?? "Verifica o email e a palavra-passe.",
      "invalid-input",
    );
  }

  const { supabase, applyCookies } = await createRouteClient(request);
  const normalizedEmail = parsed.data.email.toLowerCase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: parsed.data.password,
  });

  if (error) {
    const mapped = mapAuthErrorMessage(error.message);
    return fail(
      mapped.needsVerification ? 403 : 401,
      mapped.text,
      mapped.needsVerification ? "email-not-confirmed" : "invalid-credentials",
      mapped.needsVerification,
    );
  }

  let destination = "/onboarding";
  const userId = data.user?.id;
  if (userId) {
    const { data: memberships } = await supabase
      .from("store_memberships")
      .select("store_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1);

    if (memberships?.length) {
      destination = "/dashboard";
    }
  }

  if (isJson) {
    return applyCookies(NextResponse.json({ ok: true, redirectTo: destination }));
  }

  return applyCookies(NextResponse.redirect(new URL(destination, origin), 303));
}
