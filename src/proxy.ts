import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

function isHttpsProxyRequest(request: NextRequest): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https") return true;
  if (request.nextUrl.protocol === "https:") return true;
  const origin = request.headers.get("origin") ?? "";
  const referer = request.headers.get("referer") ?? "";
  return origin.startsWith("https://") || referer.startsWith("https://");
}

export async function proxy(request: NextRequest) {
  // If Supabase falls back to Site URL ('/') with verification params, forward to /auth/callback.
  if (request.nextUrl.pathname === "/") {
    const params = request.nextUrl.searchParams;
    if (params.has("code") || (params.has("token_hash") && params.has("type"))) {
      const callbackUrl = new URL("/auth/callback", request.nextUrl.origin);
      callbackUrl.search = request.nextUrl.search;
      return NextResponse.redirect(callbackUrl);
    }
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const isHttps = isHttpsProxyRequest(request);

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            sameSite: isHttps ? "none" : (options?.sameSite ?? "lax"),
            secure: isHttps ? true : options?.secure,
            ...(isHttps ? { partitioned: true } : {}),
          }),
        );
      },
    },
  });

  // Refreshes the auth token when needed. Authorization is enforced by server routes/RLS.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
