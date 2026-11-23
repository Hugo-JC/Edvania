import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeAuthPayload,
  encodeAuthPayload,
  extractBaileysText,
  jidToNormalizedSender,
  normalizeAngolaOrE164Phone,
  sanitizeInboundText,
  toWhatsAppJid,
} from "./baileys-utils.ts";

test("normalizeAngolaOrE164Phone handles Angola 9-digit numbers and full E.164", () => {
  assert.deepEqual(normalizeAngolaOrE164Phone("923000111"), {
    digits: "244923000111",
    e164: "+244923000111",
    jid: "244923000111@s.whatsapp.net",
  });
  assert.deepEqual(normalizeAngolaOrE164Phone("+244 923-000-111"), {
    digits: "244923000111",
    e164: "+244923000111",
    jid: "244923000111@s.whatsapp.net",
  });
  assert.deepEqual(normalizeAngolaOrE164Phone("00244923000111"), {
    digits: "244923000111",
    e164: "+244923000111",
    jid: "244923000111@s.whatsapp.net",
  });
  assert.equal(normalizeAngolaOrE164Phone("1234"), null);
});

test("toWhatsAppJid and jidToNormalizedSender strip device suffix and block groups/broadcast", () => {
  assert.equal(toWhatsAppJid("923000111"), "244923000111@s.whatsapp.net");
  assert.equal(toWhatsAppJid("244923000111:12@s.whatsapp.net"), "244923000111@s.whatsapp.net");

  assert.equal(jidToNormalizedSender("244923000111:4@s.whatsapp.net"), "244923000111@s.whatsapp.net");
  assert.equal(jidToNormalizedSender("120363000000@g.us"), null);
  assert.equal(jidToNormalizedSender("status@broadcast"), null);
  assert.equal(jidToNormalizedSender("999999999@lid", "244923000111:2@s.whatsapp.net"), "244923000111@s.whatsapp.net");
});

test("extractBaileysText unwraps ephemeral/extended messages and neutralizes control chars", () => {
  assert.equal(
    extractBaileysText({
      ephemeralMessage: {
        message: {
          extendedTextMessage: {text: "Olá\nQual é o preço\tdo arroz?\u0007"},
        },
      },
    }),
    "Olá Qual é o preço do arroz?",
  );
  assert.equal(extractBaileysText({imageMessage: {caption: "Foto da factura"}}), "Foto da factura");
  assert.equal(sanitizeInboundText("   \n\t  "), null);
});

test("encodeAuthPayload and decodeAuthPayload preserve Uint8Array/Buffer via BufferJSON", () => {
  const input = {
    registrationId: 12345,
    noiseKey: {
      public: Buffer.from([1, 2, 3, 4]),
      private: Buffer.from([5, 6, 7, 8]),
    },
  };
  const encoded = encodeAuthPayload(input);
  const decoded = decodeAuthPayload(encoded);
  assert.equal(decoded.registrationId, 12345);
  assert.equal(Buffer.from(decoded.noiseKey.public).toString("hex"), "01020304");
  assert.equal(Buffer.from(decoded.noiseKey.private).toString("hex"), "05060708");
});
