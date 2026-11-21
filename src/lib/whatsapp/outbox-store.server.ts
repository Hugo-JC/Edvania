import "server-only";
import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {getPublicEnv} from "@/lib/env";
import type {Database} from "@/lib/supabase/database.types";
import {createWhatsAppOutboxStore} from "./outbox-store";

export function createServerWhatsAppOutboxStore() {
  const {url} = getPublicEnv();
  const secretKey = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY);
  const client = createSupabaseClient<Database>(url, secretKey, {
    auth: {autoRefreshToken: false, persistSession: false},
  });
  return createWhatsAppOutboxStore({
    async claim(args) {
      const {data, error} = await client.rpc("claim_whatsapp_outbox", args);
      return {data, error};
    },
    async finalize(args) {
      const {data, error} = await client.rpc("finalize_whatsapp_outbox", args);
      return {data, error};
    },
  });
}
