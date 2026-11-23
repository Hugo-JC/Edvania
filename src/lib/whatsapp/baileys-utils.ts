import {BufferJSON} from "@whiskeysockets/baileys";

export type NormalizedPhoneInfo = Readonly<{
  digits: string;
  e164: string;
  jid: string;
}>;

export function normalizeAngolaOrE164Phone(raw: string): NormalizedPhoneInfo | null {
  let digits = raw.trim().replace(/[^0-9]/g, "");
  if (digits.startsWith("00") && digits.length > 10) {
    digits = digits.slice(2);
  }
  if (/^9[0-9]{8}$/.test(digits)) {
    digits = `244${digits}`;
  }
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) {
    return null;
  }
  return {
    digits,
    e164: `+${digits}`,
    jid: `${digits}@s.whatsapp.net`,
  };
}

export function toWhatsAppJid(phoneOrJid: string): string | null {
  const trimmed = phoneOrJid.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@s.whatsapp.net")) {
    const userPart = trimmed.split("@")[0]?.split(":")[0] ?? "";
    if (!/^[1-9][0-9]{7,14}$/.test(userPart)) return null;
    return `${userPart}@s.whatsapp.net`;
  }
  const normalized = normalizeAngolaOrE164Phone(trimmed);
  return normalized ? normalized.jid : null;
}

export function jidToNormalizedSender(remoteJid?: string | null, remoteJidAlt?: string | null): string | null {
  const candidates = [remoteJid, remoteJidAlt].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed === "status@broadcast" || trimmed.endsWith("@g.us") || trimmed.endsWith("@newsletter")) {
      continue;
    }
    if (trimmed.endsWith("@s.whatsapp.net")) {
      const userDigits = (trimmed.split("@")[0] ?? "").split(":")[0]?.replace(/[^0-9]/g, "") ?? "";
      if (/^[1-9][0-9]{7,19}$/.test(userDigits)) {
        return `${userDigits}@s.whatsapp.net`;
      }
    }
  }
  return null;
}

export function sanitizeInboundText(raw: string): string | null {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, 4096).join("");
}

type UnknownMessageLike = {
  conversation?: string | null;
  extendedTextMessage?: {text?: string | null} | null;
  imageMessage?: {caption?: string | null} | null;
  videoMessage?: {caption?: string | null} | null;
  documentMessage?: {caption?: string | null} | null;
  buttonsResponseMessage?: {selectedDisplayText?: string | null} | null;
  listResponseMessage?: {title?: string | null} | null;
  ephemeralMessage?: {message?: UnknownMessageLike | null} | null;
  viewOnceMessage?: {message?: UnknownMessageLike | null} | null;
  viewOnceMessageV2?: {message?: UnknownMessageLike | null} | null;
};

export function extractBaileysText(message: UnknownMessageLike | null | undefined, depth = 0): string | null {
  if (!message || depth > 4) return null;

  if (message.ephemeralMessage?.message) {
    return extractBaileysText(message.ephemeralMessage.message, depth + 1);
  }
  if (message.viewOnceMessage?.message) {
    return extractBaileysText(message.viewOnceMessage.message, depth + 1);
  }
  if (message.viewOnceMessageV2?.message) {
    return extractBaileysText(message.viewOnceMessageV2.message, depth + 1);
  }

  const raw =
    message.conversation
    ?? message.extendedTextMessage?.text
    ?? message.imageMessage?.caption
    ?? message.videoMessage?.caption
    ?? message.documentMessage?.caption
    ?? message.buttonsResponseMessage?.selectedDisplayText
    ?? message.listResponseMessage?.title
    ?? null;

  if (typeof raw !== "string") return null;
  return sanitizeInboundText(raw);
}

export function encodeAuthPayload(value: unknown): Uint8Array {
  const json = JSON.stringify(value, BufferJSON.replacer);
  return Buffer.from(json, "utf8");
}

export function decodeAuthPayload<T>(plaintext: Uint8Array): T {
  const json = Buffer.from(plaintext).toString("utf8");
  return JSON.parse(json, BufferJSON.reviver) as T;
}
