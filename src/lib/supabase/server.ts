import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import { createMockSupabaseClient, MOCK_AUTH_COOKIE, parseSessionCookie } from "./mock";

export async function createClient() {
  const cookieStore = await cookies();
  if (!isSupabaseConfigured()) {
    return createMockSupabaseClient({
      getSession: () => parseSessionCookie(cookieStore.get(MOCK_AUTH_COOKIE)?.value),
      setSession: (session) => {
        try {
          if (session) {
            cookieStore.set(MOCK_AUTH_COOKIE, encodeURIComponent(JSON.stringify(session)), {
              path: "/",
              maxAge: 60 * 60 * 24 * 7,
              sameSite: "lax",
            });
          } else {
            cookieStore.delete(MOCK_AUTH_COOKIE);
          }
        } catch {
          // Server Components cannot write cookies.
        }
      },
    });
  }

  const { url, publishableKey } = getPublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}
