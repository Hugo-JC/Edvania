import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "./database.types";

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(isSupabaseConfigured() && process.env.SUPABASE_SECRET_KEY?.trim());
}

export function getSupabaseAdminClient(): SupabaseClient<Database> | null {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }
  const { url } = getPublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY!.trim();
  return createSupabaseClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
