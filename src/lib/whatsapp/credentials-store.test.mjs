import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {CredentialEncryptionError} from "./credential-encryption.ts";
import {createEncryptedCredentialStore} from "./credentials-store.ts";

const storeId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const sessionId = "session-main";

test("encrypted credential store encrypts, loads, isolates AAD context, and rotates key versions", async () => {
  const rows = new Map();
  let activeVersion = "v1";
  const keyV1 = randomBytes(32);
  const keyV2 = randomBytes(32);
  const keys = new Map([["v1", keyV1]]);

  const port = {
    async upsert(record) {
      rows.set(`${record.storeId}:${record.connectionId}:${record.sessionId}:${record.keyType}:${record.keyId}`, record);
    },
    async find(input) {
      return rows.get(`${input.storeId}:${input.connectionId}:${input.sessionId}:${input.keyType}:${input.keyId}`) ?? null;
    },
  };

  const store = createEncryptedCredentialStore(port, () => ({activeVersion, keys}));
  const secretBytes = Buffer.from(JSON.stringify({creds: "super-secret"}), "utf8");

  const saved = await store.saveCredential({
    storeId,
    connectionId,
    sessionId,
    keyType: "creds",
    keyId: "default",
    plaintext: secretBytes,
  });
  assert.equal(saved.encryptionKeyVersion, "v1");

  const rawStored = rows.get(`${storeId}:${connectionId}:${sessionId}:creds:default`);
  assert.equal(rawStored.encryptedData.includes("super-secret"), false);

  const loaded = await store.loadCredential({
    storeId,
    connectionId,
    sessionId,
    keyType: "creds",
    keyId: "default",
  });
  assert.deepEqual(Buffer.from(loaded.plaintext), secretBytes);

  // Tampering store context on persisted record must fail authentication
  rows.set(`99999999-9999-4999-8999-999999999999:${connectionId}:${sessionId}:creds:default`, rawStored);
  await assert.rejects(
    store.loadCredential({
      storeId: "99999999-9999-4999-8999-999999999999",
      connectionId,
      sessionId,
      keyType: "creds",
      keyId: "default",
    }),
    (error) => error instanceof CredentialEncryptionError && error.code === "authentication_failed",
  );

  // Rotate from v1 to v2
  activeVersion = "v2";
  keys.set("v2", keyV2);
  const rotated = await store.rotateCredential({
    storeId,
    connectionId,
    sessionId,
    keyType: "creds",
    keyId: "default",
  });
  assert.deepEqual(rotated, {rotated: true, encryptionKeyVersion: "v2"});

  // Remove old v1 key — v2 record still decrypts cleanly
  keys.delete("v1");
  const afterRotation = await store.loadCredential({
    storeId,
    connectionId,
    sessionId,
    keyType: "creds",
    keyId: "default",
  });
  assert.deepEqual(Buffer.from(afterRotation.plaintext), secretBytes);
});
