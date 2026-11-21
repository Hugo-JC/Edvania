import test from "node:test";
import assert from "node:assert/strict";
import {
  CredentialEncryptionError,
  openCredentialState,
  sealCredentialState,
} from "./credential-encryption.ts";

const context = {
  storeId: "11111111-1111-4111-8111-111111111111",
  connectionId: "22222222-2222-4222-8222-222222222222",
  sessionId: "creds",
};
const keyV1 = new Uint8Array(32).fill(17);
const keyV2 = new Uint8Array(32).fill(23);
const plaintext = new TextEncoder().encode("mock-auth-state");

test("credential envelope round-trips with AES-256-GCM and versioned key", () => {
  const envelope = sealCredentialState(plaintext, keyV1, "v1", context);
  const opened = openCredentialState(envelope, {activeVersion: "v1", keys: new Map([["v1", keyV1]])}, context);

  assert.deepEqual(opened, plaintext);
  assert.equal(envelope.split(".")[0], "v1");
  assert.equal(envelope.split(".")[1], "v1");
});

test("authenticated data binds credentials to tenant, connection, and session", () => {
  const envelope = sealCredentialState(plaintext, keyV1, "v1", context);
  const keyring = {activeVersion: "v1", keys: new Map([["v1", keyV1]])};

  assert.throws(() => openCredentialState(envelope, keyring, {...context, storeId: "33333333-3333-4333-8333-333333333333"}), CredentialEncryptionError);
  assert.throws(() => openCredentialState(envelope, keyring, {...context, connectionId: "33333333-3333-4333-8333-333333333333"}), CredentialEncryptionError);
  assert.throws(() => openCredentialState(envelope, keyring, {...context, sessionId: "other-session"}), CredentialEncryptionError);
});

test("tampering, unknown versions, malformed envelopes, and missing keys fail closed", () => {
  const envelope = sealCredentialState(plaintext, keyV1, "v1", context);
  const [format, version, nonce, tag, cipherText] = envelope.split(".");
  const tagBytes = Buffer.from(tag, "base64url");
  tagBytes[0] ^= 0xff;
  const tampered = [format, version, nonce, tagBytes.toString("base64url"), cipherText].join(".");

  assert.throws(() => openCredentialState(tampered, {activeVersion: "v1", keys: new Map([["v1", keyV1]])}, context), CredentialEncryptionError);
  assert.throws(() => openCredentialState(envelope, {activeVersion: "v2", keys: new Map([["v2", keyV2]])}, context), (error) => error.code === "missing_key_version");
  assert.throws(() => openCredentialState("plaintext", {activeVersion: "v1", keys: new Map()}, context), (error) => error.code === "unsupported_format");
  assert.throws(() => sealCredentialState(plaintext, new Uint8Array(16), "v1", context), (error) => error.code === "invalid_key");
});

test("key rotation can decrypt old data and encrypt with the new active version", () => {
  const legacyEnvelope = sealCredentialState(plaintext, keyV1, "v1", context);
  const keyring = {activeVersion: "v2", keys: new Map([["v1", keyV1], ["v2", keyV2]])};
  const opened = openCredentialState(legacyEnvelope, keyring, context);
  const rotatedEnvelope = sealCredentialState(opened, keyring.keys.get(keyring.activeVersion), keyring.activeVersion, context);

  assert.deepEqual(openCredentialState(rotatedEnvelope, keyring, context), plaintext);
  assert.equal(rotatedEnvelope.split(".")[1], "v2");
});
