import {createCipheriv, createDecipheriv, randomBytes} from "node:crypto";

export type CredentialContext = Readonly<{
  storeId: string;
  connectionId: string;
  sessionId: string;
}>;

export type CredentialKeyring = Readonly<{
  activeVersion: string;
  keys: ReadonlyMap<string, Uint8Array>;
}>;

export class CredentialEncryptionError extends Error {
  readonly code:
    | "invalid_context"
    | "invalid_key"
    | "invalid_key_version"
    | "missing_keyring"
    | "missing_key_version"
    | "unsupported_format"
    | "invalid_ciphertext"
    | "authentication_failed";

  constructor(code: CredentialEncryptionError["code"]) {
    super(code);
    this.code = code;
    this.name = "CredentialEncryptionError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyVersionPattern = /^[a-zA-Z0-9_-]{1,32}$/;
const envelopeVersion = "v1";
const maxCredentialBytes = 2 * 1024 * 1024;

function validateContext(context: CredentialContext) {
  if (
    !uuidPattern.test(context.storeId)
    || !uuidPattern.test(context.connectionId)
    || !context.sessionId.trim()
    || context.sessionId.length > 128
    || /[\u0000-\u001f\u007f]/.test(context.sessionId)
  ) {
    throw new CredentialEncryptionError("invalid_context");
  }
}

function validateKey(key: Uint8Array) {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) throw new CredentialEncryptionError("invalid_key");
}

function associatedData(context: CredentialContext, keyVersion: string) {
  validateContext(context);
  if (!keyVersionPattern.test(keyVersion)) throw new CredentialEncryptionError("invalid_key_version");
  return Buffer.from(`edvania:whatsapp-auth:${envelopeVersion}:${context.storeId}:${context.connectionId}:${context.sessionId}:${keyVersion}`, "utf8");
}

function encode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new CredentialEncryptionError("invalid_ciphertext");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw new CredentialEncryptionError("invalid_ciphertext");
  return bytes;
}

export function sealCredentialState(plaintext: Uint8Array, key: Uint8Array, keyVersion: string, context: CredentialContext): string {
  validateKey(key);
  if (!(plaintext instanceof Uint8Array) || plaintext.byteLength === 0 || plaintext.byteLength > maxCredentialBytes) {
    throw new CredentialEncryptionError("invalid_ciphertext");
  }
  const aad = associatedData(context, keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [envelopeVersion, keyVersion, encode(nonce), encode(tag), encode(ciphertext)].join(".");
}

export function openCredentialState(
  envelope: string,
  keyring: CredentialKeyring,
  context: CredentialContext,
): Uint8Array {
  validateContext(context);
  if (envelope.length > maxCredentialBytes * 2) throw new CredentialEncryptionError("invalid_ciphertext");
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== envelopeVersion || !keyVersionPattern.test(parts[1])) {
    throw new CredentialEncryptionError("unsupported_format");
  }
  const [, keyVersion, encodedNonce, encodedTag, encodedCiphertext] = parts;
  const key = keyring.keys.get(keyVersion);
  if (!key) throw new CredentialEncryptionError("missing_key_version");
  validateKey(key);

  const nonce = decode(encodedNonce);
  const tag = decode(encodedTag);
  const ciphertext = decode(encodedCiphertext);
  if (nonce.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength === 0 || ciphertext.byteLength > maxCredentialBytes) {
    throw new CredentialEncryptionError("invalid_ciphertext");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(associatedData(context, keyVersion));
  decipher.setAuthTag(tag);
  try {
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch {
    throw new CredentialEncryptionError("authentication_failed");
  }
}
