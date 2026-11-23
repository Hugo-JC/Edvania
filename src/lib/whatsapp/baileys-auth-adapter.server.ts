import "server-only";
import {
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import {getSupabaseAdminClient, isSupabaseAdminConfigured} from "@/lib/supabase/admin";
import {decodeAuthPayload, encodeAuthPayload} from "./baileys-utils";
import {getWhatsAppCredentialKeyring} from "./credential-encryption.server";
import {createServerEncryptedCredentialStore} from "./credentials-store.server";

export type BaileysPersistenceMode = "encrypted_db" | "ephemeral_memory";

type MemorySessionBucket = {
  creds?: AuthenticationCreds;
  keys: Map<string, unknown>;
};

const globalAuthMemory = globalThis as unknown as {
  __edvaniaBaileysMemoryAuth?: Map<string, MemorySessionBucket>;
};

function getMemoryBuckets(): Map<string, MemorySessionBucket> {
  if (!globalAuthMemory.__edvaniaBaileysMemoryAuth) {
    globalAuthMemory.__edvaniaBaileysMemoryAuth = new Map();
  }
  return globalAuthMemory.__edvaniaBaileysMemoryAuth;
}

export function isBaileysEncryptedDbPersistenceReady(): boolean {
  if (!isSupabaseAdminConfigured()) return false;
  try {
    getWhatsAppCredentialKeyring();
    return true;
  } catch {
    return false;
  }
}

function sanitizeKeyId(id: string): string {
  // Credential store restricts keyId to /^[a-zA-Z0-9._:-]{1,128}$/.
  return Buffer.from(id, "utf8").toString("base64url").slice(0, 128) || "default";
}

export async function createEdvaniaBaileysAuthState(
  storeId: string,
  connectionId: string,
  sessionId = "primary",
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  wipe: () => Promise<void>;
  persistenceMode: BaileysPersistenceMode;
}> {
  const bucketKey = `${storeId}:${connectionId}:${sessionId}`;
  const buckets = getMemoryBuckets();
  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    bucket = {keys: new Map()};
    buckets.set(bucketKey, bucket);
  }

  const useEncryptedDb = isBaileysEncryptedDbPersistenceReady();
  const persistenceMode: BaileysPersistenceMode = useEncryptedDb ? "encrypted_db" : "ephemeral_memory";
  const credentialStore = useEncryptedDb ? createServerEncryptedCredentialStore() : null;

  const readRecord = async <T>(keyType: string, keyId: string): Promise<T | null> => {
    const cacheKey = `${keyType}:${keyId}`;
    if (bucket.keys.has(cacheKey)) {
      return (bucket.keys.get(cacheKey) as T | null) ?? null;
    }
    if (!credentialStore) return null;

    try {
      const loaded = await credentialStore.loadCredential({
        storeId,
        connectionId,
        sessionId,
        keyType,
        keyId: sanitizeKeyId(keyId),
      });
      if (!loaded) return null;
      const decoded = decodeAuthPayload<T>(loaded.plaintext);
      bucket.keys.set(cacheKey, decoded);
      return decoded;
    } catch {
      return null;
    }
  };

  const writeRecord = async (keyType: string, keyId: string, value: unknown | null): Promise<void> => {
    const cacheKey = `${keyType}:${keyId}`;
    if (value === null || value === undefined) {
      bucket.keys.delete(cacheKey);
      if (credentialStore) {
        const admin = getSupabaseAdminClient();
        await admin
          ?.from("baileys_auth_state")
          .delete()
          .eq("store_id", storeId)
          .eq("connection_id", connectionId)
          .eq("session_id", sessionId)
          .eq("key_type", keyType)
          .eq("key_id", sanitizeKeyId(keyId));
      }
      return;
    }

    bucket.keys.set(cacheKey, value);
    if (credentialStore) {
      await credentialStore.saveCredential({
        storeId,
        connectionId,
        sessionId,
        keyType,
        keyId: sanitizeKeyId(keyId),
        plaintext: encodeAuthPayload(value),
      });
    }
  };

  if (!bucket.creds) {
    bucket.creds = (await readRecord<AuthenticationCreds>("creds", "primary")) ?? initAuthCreds();
  }

  const state: AuthenticationState = {
    creds: bucket.creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const data: {[id: string]: SignalDataTypeMap[T]} = {};
        await Promise.all(
          ids.map(async (id) => {
            let value = await readRecord<SignalDataTypeMap[T]>(String(type), id);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as Record<string, unknown>,
              ) as unknown as SignalDataTypeMap[T];
            }
            if (value !== null) {
              data[id] = value;
            }
          }),
        );
        return data;
      },
      set: async (data: SignalDataSet) => {
        const tasks: Promise<void>[] = [];
        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          const entries = data[category];
          if (!entries) continue;
          for (const id of Object.keys(entries)) {
            const value = entries[id];
            tasks.push(writeRecord(String(category), id, value ?? null));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  return {
    state,
    persistenceMode,
    saveCreds: async () => {
      await writeRecord("creds", "primary", state.creds);
    },
    wipe: async () => {
      bucket.keys.clear();
      bucket.creds = initAuthCreds();
      buckets.delete(bucketKey);
      const admin = getSupabaseAdminClient();
      if (admin) {
        await admin
          .from("baileys_auth_state")
          .delete()
          .eq("store_id", storeId)
          .eq("connection_id", connectionId)
          .eq("session_id", sessionId);
      }
    },
  };
}
