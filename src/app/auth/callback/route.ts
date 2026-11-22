import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSafePublicOrigin, sanitizeNextPath } from "@/lib/supabase/auth-helpers";
import { createRouteClient } from "@/lib/supabase/server";

const otpTypeSchema = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function GET(request: NextRequest) {
  const origin = getSafePublicOrigin(request);
  const { searchParams } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const errorParam = searchParams.get("error") || searchParams.get("error_description");
  const nextPath = sanitizeNextPath(searchParams.get("next"), "/dashboard");

  if (errorParam) {
    return NextResponse.redirect(new URL("/login?error=verification-failed", origin));
  }

  const { supabase, applyCookies } = await createRouteClient(request);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return applyCookies(NextResponse.redirect(new URL("/login?error=verification-failed", origin)));
    }
  } else if (tokenHash && rawType) {
    const parsedType = otpTypeSchema.safeParse(rawType);
    if (!parsedType.success) {
      return NextResponse.redirect(new URL("/login?error=verification-failed", origin));
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: parsedType.data as EmailOtpType,
    });
    if (error) {
      return applyCookies(NextResponse.redirect(new URL("/login?error=verification-failed", origin)));
    }
  } else {
    return NextResponse.redirect(new URL("/login?error=verification-failed", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(NextResponse.redirect(new URL("/login?error=verification-failed", origin)));
  }

  const { data: memberships } = await supabase
    .from("store_memberships")
    .select("store_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  const destination = memberships?.length ? nextPath : "/onboarding";
  return applyCookies(NextResponse.redirect(new URL(destination, origin)));
}
