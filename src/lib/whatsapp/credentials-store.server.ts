import "server-only";
import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {getPublicEnv} from "@/lib/env";
import type {Database} from "@/lib/supabase/database.types";
import {getWhatsAppCredentialKeyring} from "./credential-encryption.server";
import {createEncryptedCredentialStore} from "./credentials-store";

export function createServerEncryptedCredentialStore() {
  const {url} = getPublicEnv();
  const secretKey = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY);
  const client = createSupabaseClient<Database>(url, secretKey, {
    auth: {autoRefreshToken: false, persistSession: false},
  });

  return createEncryptedCredentialStore(
    {
      async upsert(record) {
        const {error} = await client.from("baileys_auth_state").upsert(
          {
            store_id: record.storeId,
            connection_id: record.connectionId,
            session_id: record.sessionId,
            key_type: record.keyType,
            key_id: record.keyId,
            encrypted_data: record.encryptedData,
            encryption_key_version: record.encryptionKeyVersion,
            updated_at: new Date().toISOString(),
          },
          {onConflict: "store_id,connection_id,session_id,key_type,key_id"},
        );
        if (error) throw new Error("credential_store_write_failed");
      },
      async find(input) {
        const {data, error} = await client
          .from("baileys_auth_state")
          .select("store_id,connection_id,session_id,key_type,key_id,encrypted_data,encryption_key_version")
          .eq("store_id", input.storeId)
          .eq("connection_id", input.connectionId)
          .eq("session_id", input.sessionId)
          .eq("key_type", input.keyType)
          .eq("key_id", input.keyId)
          .maybeSingle();
        if (error) throw new Error("credential_store_read_failed");
        if (!data) return null;
        return {
          storeId: data.store_id,
          connectionId: data.connection_id,
          sessionId: data.session_id,
          keyType: data.key_type,
          keyId: data.key_id,
          encryptedData: data.encrypted_data,
          encryptionKeyVersion: data.encryption_key_version,
        };
      },
    },
    getWhatsAppCredentialKeyring,
  );
}
