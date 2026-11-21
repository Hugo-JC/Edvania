import "server-only";
import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {getPublicEnv} from "@/lib/env";
import type {Database} from "@/lib/supabase/database.types";
import {createWhatsAppInboundStore} from "./inbound-store";

export function createServerWhatsAppInboundStore() {
  const {url} = getPublicEnv();
  const secretKey = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY);
  const client = createSupabaseClient<Database>(url, secretKey, {
    auth: {autoRefreshToken: false, persistSession: false},
  });
  return createWhatsAppInboundStore({
    async enqueue(args) {
      const {data, error} = await client.rpc("enqueue_whatsapp_inbound", args);
      return {data, error};
    },
  });
}
