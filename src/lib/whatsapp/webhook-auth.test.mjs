import test from "node:test";
import assert from "node:assert/strict";
import {
  signWhatsAppWebhookPayload,
  verifyBearerSecret,
  verifyWhatsAppWebhookSignature,
} from "./webhook-auth.ts";

test("webhook HMAC signature verification accepts valid signatures and fails closed otherwise", () => {
  const secret = "webhook-secret-123";
  const body = JSON.stringify({connectionId: "11111111-1111-4111-8111-111111111111", text: "Olá"});
  const signature = signWhatsAppWebhookPayload(body, secret);

  assert.equal(verifyWhatsAppWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWhatsAppWebhookSignature(`${body} `, signature, secret), false);
  assert.equal(verifyWhatsAppWebhookSignature(body, "sha256=deadbeef", secret), false);
  assert.equal(verifyWhatsAppWebhookSignature(body, signature, ""), false);
  assert.equal(verifyWhatsAppWebhookSignature(body, null, secret), false);
});

test("bearer secret verification requires non-empty secret and exact match", () => {
  assert.equal(verifyBearerSecret("Bearer worker-secret", "worker-secret"), true);
  assert.equal(verifyBearerSecret("Bearer wrong", "worker-secret"), false);
  assert.equal(verifyBearerSecret("Basic worker-secret", "worker-secret"), false);
  assert.equal(verifyBearerSecret("Bearer worker-secret", ""), false);
});
