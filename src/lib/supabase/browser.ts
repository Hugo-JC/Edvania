"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import { createMockSupabaseClient, MOCK_AUTH_COOKIE, parseSessionCookie } from "./mock";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!isSupabaseConfigured()) {
    browserClient ??= createMockSupabaseClient({
      getSession: () => {
        if (typeof document === "undefined") return null;
        const match = document.cookie
          .split("; ")
          .find((entry) => entry.startsWith(`${MOCK_AUTH_COOKIE}=`));
        return parseSessionCookie(match?.split("=").slice(1).join("="));
      },
      setSession: (session) => {
        if (typeof document === "undefined") return;
        if (session) {
          document.cookie = `${MOCK_AUTH_COOKIE}=${encodeURIComponent(JSON.stringify(session))}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        } else {
          document.cookie = `${MOCK_AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
        }
      },
    });
    return browserClient;
  }

  const { url, publishableKey } = getPublicEnv();
  browserClient ??= createBrowserClient<Database>(url, publishableKey);
  return browserClient;
}
