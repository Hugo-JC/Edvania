import "server-only";
import {z} from "zod";
import {CredentialEncryptionError, type CredentialKeyring} from "./credential-encryption";

const keyringSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), z.string().regex(/^[A-Za-z0-9_-]{43}$/));

export function getWhatsAppCredentialKeyring(): CredentialKeyring {
  const activeVersion = process.env.WHATSAPP_CREDENTIALS_ACTIVE_KEY_VERSION;
  const rawKeyring = process.env.WHATSAPP_CREDENTIALS_KEYRING;
  if (!activeVersion || !rawKeyring) throw new CredentialEncryptionError("missing_keyring");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawKeyring);
  } catch {
    throw new CredentialEncryptionError("invalid_key");
  }
  const parsed = keyringSchema.safeParse(parsedJson);
  if (!parsed.success || !Object.hasOwn(parsed.data, activeVersion)) throw new CredentialEncryptionError("invalid_key");

  const keys = new Map<string, Uint8Array>();
  for (const [version, encoded] of Object.entries(parsed.data)) {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.byteLength !== 32 || bytes.toString("base64url") !== encoded) {
      throw new CredentialEncryptionError("invalid_key");
    }
    keys.set(version, bytes);
  }
  return {activeVersion, keys};
}
