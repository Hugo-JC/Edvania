import {
  CredentialEncryptionError,
  openCredentialState,
  sealCredentialState,
  type CredentialContext,
  type CredentialKeyring,
} from "./credential-encryption.ts";

export type StoredEncryptedCredential = Readonly<{
  storeId: string;
  connectionId: string;
  sessionId: string;
  keyType: string;
  keyId: string;
  encryptedData: string;
  encryptionKeyVersion: string;
}>;

export interface EncryptedCredentialPersistencePort {
  upsert(record: StoredEncryptedCredential): Promise<void>;
  find(input: Readonly<{
    storeId: string;
    connectionId: string;
    sessionId: string;
    keyType: string;
    keyId: string;
  }>): Promise<StoredEncryptedCredential | null>;
}

const keyPartPattern = /^[a-zA-Z0-9._:-]{1,128}$/;

function validateKeyParts(keyType: string, keyId: string) {
  if (!keyPartPattern.test(keyType) || !keyPartPattern.test(keyId)) {
    throw new CredentialEncryptionError("invalid_context");
  }
}

export function createEncryptedCredentialStore(
  port: EncryptedCredentialPersistencePort,
  getKeyring: () => CredentialKeyring,
) {
  return {
    async saveCredential(input: CredentialContext & Readonly<{
      keyType: string;
      keyId: string;
      plaintext: Uint8Array;
    }>): Promise<{encryptionKeyVersion: string}> {
      validateKeyParts(input.keyType, input.keyId);
      const keyring = getKeyring();
      const activeKey = keyring.keys.get(keyring.activeVersion);
      if (!activeKey) throw new CredentialEncryptionError("missing_key_version");

      const context: CredentialContext = {
        storeId: input.storeId,
        connectionId: input.connectionId,
        sessionId: input.sessionId,
      };
      const encryptedData = sealCredentialState(input.plaintext, activeKey, keyring.activeVersion, context);
      await port.upsert({
        ...context,
        keyType: input.keyType,
        keyId: input.keyId,
        encryptedData,
        encryptionKeyVersion: keyring.activeVersion,
      });
      return {encryptionKeyVersion: keyring.activeVersion};
    },

    async loadCredential(input: CredentialContext & Readonly<{
      keyType: string;
      keyId: string;
    }>): Promise<{plaintext: Uint8Array; encryptionKeyVersion: string} | null> {
      validateKeyParts(input.keyType, input.keyId);
      const record = await port.find({
        storeId: input.storeId,
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        keyType: input.keyType,
        keyId: input.keyId,
      });
      if (!record) return null;

      const keyring = getKeyring();
      const plaintext = openCredentialState(record.encryptedData, keyring, {
        storeId: input.storeId,
        connectionId: input.connectionId,
        sessionId: input.sessionId,
      });
      return {plaintext, encryptionKeyVersion: record.encryptionKeyVersion};
    },

    async rotateCredential(input: CredentialContext & Readonly<{
      keyType: string;
      keyId: string;
    }>): Promise<{rotated: boolean; encryptionKeyVersion: string} | null> {
      validateKeyParts(input.keyType, input.keyId);
      const record = await port.find({
        storeId: input.storeId,
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        keyType: input.keyType,
        keyId: input.keyId,
      });
      if (!record) return null;

      const keyring = getKeyring();
      const context: CredentialContext = {
        storeId: input.storeId,
        connectionId: input.connectionId,
        sessionId: input.sessionId,
      };
      const plaintext = openCredentialState(record.encryptedData, keyring, context);
      if (record.encryptionKeyVersion === keyring.activeVersion) {
        return {rotated: false, encryptionKeyVersion: keyring.activeVersion};
      }

      const activeKey = keyring.keys.get(keyring.activeVersion);
      if (!activeKey) throw new CredentialEncryptionError("missing_key_version");
      const encryptedData = sealCredentialState(plaintext, activeKey, keyring.activeVersion, context);
      await port.upsert({
        ...context,
        keyType: input.keyType,
        keyId: input.keyId,
        encryptedData,
        encryptionKeyVersion: keyring.activeVersion,
      });
      return {rotated: true, encryptionKeyVersion: keyring.activeVersion};
    },
  };
}
