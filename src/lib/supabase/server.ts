import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import type { Database } from "./database.types";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import {
  createMockSupabaseClient,
  MOCK_AUTH_COOKIE,
  parseSessionCookie,
  type MockUserSession,
} from "./mock";

const globalSigning = globalThis as unknown as { __edvaniaMockSigningKey?: Buffer };

function getMockSigningKey(): Buffer {
  const configured = process.env.MOCK_AUTH_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (configured) {
    return Buffer.from(configured, "utf8");
  }
  if (!globalSigning.__edvaniaMockSigningKey) {
    globalSigning.__edvaniaMockSigningKey = randomBytes(32);
  }
  return globalSigning.__edvaniaMockSigningKey;
}

export function signMockSessionCookie(session: MockUserSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const sig = createHmac("sha256", getMockSigningKey()).update(payload).digest("base64url");
  return `v1.${payload}.${sig}`;
}

export function verifyMockSessionCookie(raw: string | undefined): MockUserSession | null {
  if (!raw) return null;
  if (!raw.startsWith("v1.")) {
    return null;
  }
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [, payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", getMockSigningKey()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    return parseSessionCookie(decoded);
  } catch {
    return null;
  }
}

async function isHttpsRequest(request?: Request): Promise<boolean> {
  if (request) {
    const forwarded = request.headers.get("x-forwarded-proto") ?? "";
    if (forwarded.split(",")[0]?.trim() === "https") return true;
    const origin = request.headers.get("origin") ?? "";
    const referer = request.headers.get("referer") ?? "";
    if (origin.startsWith("https://") || referer.startsWith("https://")) return true;
    try {
      return new URL(request.url).protocol === "https:";
    } catch {
      return false;
    }
  }
  try {
    const headerStore = await headers();
    const proto = headerStore.get("x-forwarded-proto") ?? "";
    if (proto.split(",")[0]?.trim() === "https") return true;
    const origin = headerStore.get("origin") ?? "";
    const referer = headerStore.get("referer") ?? "";
    return origin.startsWith("https://") || referer.startsWith("https://");
  } catch {
    return false;
  }
}

export async function createClient() {
  const cookieStore = await cookies();
  const isHttps = await isHttpsRequest();

  if (!isSupabaseConfigured()) {
    return createMockSupabaseClient({
      getSession: () => verifyMockSessionCookie(cookieStore.get(MOCK_AUTH_COOKIE)?.value),
      setSession: (session) => {
        try {
          if (session) {
            cookieStore.set(MOCK_AUTH_COOKIE, signMockSessionCookie(session), {
              path: "/",
              maxAge: 60 * 60 * 24 * 7,
              sameSite: isHttps ? "none" : "lax",
              secure: isHttps,
              httpOnly: true,
              ...(isHttps ? { partitioned: true } : {}),
            });
          } else {
            cookieStore.set(MOCK_AUTH_COOKIE, "", {
              path: "/",
              maxAge: 0,
              sameSite: isHttps ? "none" : "lax",
              secure: isHttps,
              httpOnly: true,
              ...(isHttps ? { partitioned: true } : {}),
            });
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
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              sameSite: isHttps ? "none" : (options?.sameSite ?? "lax"),
              secure: isHttps ? true : options?.secure,
              ...(isHttps ? { partitioned: true } : {}),
            }),
          );
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}

type CookieUpdate = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export async function createRouteClient(request: Request) {
  const cookieStore = await cookies();
  const isHttps = await isHttpsRequest(request);
  const pending: CookieUpdate[] = [];
  let latestMockSession: MockUserSession | null | undefined = undefined;

  const applyCookies = <T extends NextResponse>(response: T): T => {
    for (const item of pending) {
      response.cookies.set(item.name, item.value, item.options);
    }
    return response;
  };

  if (!isSupabaseConfigured()) {
    const supabase = createMockSupabaseClient({
      getSession: () => {
        if (latestMockSession !== undefined) {
          return latestMockSession;
        }
        return verifyMockSessionCookie(cookieStore.get(MOCK_AUTH_COOKIE)?.value);
      },
      setSession: (session) => {
        latestMockSession = session;
        const options = {
          path: "/",
          maxAge: session ? 60 * 60 * 24 * 7 : 0,
          sameSite: isHttps ? ("none" as const) : ("lax" as const),
          secure: isHttps,
          httpOnly: true,
          ...(isHttps ? { partitioned: true } : {}),
        };
        const value = session ? signMockSessionCookie(session) : "";
        pending.push({ name: MOCK_AUTH_COOKIE, value, options });
      },
    });
    return { supabase, applyCookies };
  }

  const { url, publishableKey } = getPublicEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        const merged = new Map<string, { name: string; value: string }>();
        for (const item of cookieStore.getAll()) {
          merged.set(item.name, item);
        }
        for (const item of pending) {
          merged.set(item.name, { name: item.name, value: item.value });
        }
        return Array.from(merged.values());
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pending.push({
            name,
            value,
            options: {
              ...options,
              sameSite: isHttps ? "none" : (options?.sameSite ?? "lax"),
              secure: isHttps ? true : options?.secure,
              ...(isHttps ? { partitioned: true } : {}),
            },
          });
        });
      },
    },
  });

  return { supabase, applyCookies };
}
