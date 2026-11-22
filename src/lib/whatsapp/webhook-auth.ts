import {createHmac, timingSafeEqual} from "node:crypto";

export function signWhatsAppWebhookPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

export function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret || !secret.trim() || !signatureHeader) return false;
  const trimmed = signatureHeader.trim();
  const hex = trimmed.startsWith("sha256=") ? trimmed.slice(7) : trimmed;
  if (!/^[a-f0-9]{64}$/i.test(hex)) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const providedBuf = Buffer.from(hex.toLowerCase(), "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export function verifyBearerSecret(
  authorizationHeader: string | null | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  if (!expectedSecret || !expectedSecret.trim() || !authorizationHeader) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;
  const provided = Buffer.from(match[1].trim(), "utf8");
  const expected = Buffer.from(expectedSecret.trim(), "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
