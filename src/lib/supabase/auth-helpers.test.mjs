import assert from "node:assert/strict";
import test from "node:test";
import {
  getSafePublicOrigin,
  isTrustedSameOrigin,
  mapAuthErrorMessage,
  sanitizeNextPath,
} from "./auth-helpers.ts";

test("sanitizeNextPath blocks open-redirect attempts and allows safe relative routes", () => {
  assert.equal(sanitizeNextPath(null), "/dashboard");
  assert.equal(sanitizeNextPath(""), "/dashboard");
  assert.equal(sanitizeNextPath("//evil.com/steal"), "/dashboard");
  assert.equal(sanitizeNextPath("https://evil.com"), "/dashboard");
  assert.equal(sanitizeNextPath("/\\evil.com"), "/dashboard");
  assert.equal(sanitizeNextPath("/onboarding"), "/onboarding");
  assert.equal(sanitizeNextPath("/dashboard?store=123"), "/dashboard?store=123");
});

test("isTrustedSameOrigin validates direct, forwarded, and *.run.app proxy origins", () => {
  const makeReq = (headers, url = "http://localhost:3000/api/auth/login") => ({
    headers: new Headers(headers),
    nextUrl: new URL(url),
  });

  assert.equal(isTrustedSameOrigin(makeReq({})), true);
  assert.equal(
    isTrustedSameOrigin(makeReq({ origin: "http://localhost:3000", host: "localhost:3000" })),
    true,
  );
  assert.equal(
    isTrustedSameOrigin(
      makeReq({
        origin: "https://ais-dev-demo.europe-west2.run.app",
        host: "localhost:3000",
      }),
    ),
    true,
  );
  assert.equal(
    isTrustedSameOrigin(
      makeReq({
        origin: "https://evil.example.com",
        host: "localhost:3000",
      }),
    ),
    false,
  );
});

test("getSafePublicOrigin honors validated forwarded headers and rejects malformed host injection", () => {
  const makeReq = (headers, url = "http://localhost:3000/login") => ({
    headers: new Headers(headers),
    nextUrl: new URL(url),
  });

  assert.equal(
    getSafePublicOrigin(
      makeReq({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.edvania.ao",
      }),
    ),
    "https://app.edvania.ao",
  );
  assert.equal(
    getSafePublicOrigin(
      makeReq({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.com/steal@victim.com",
        host: "localhost:3000",
      }),
    ),
    "https://localhost:3000",
  );
});

test("mapAuthErrorMessage flags unconfirmed and already-registered errors for verification UI", () => {
  assert.deepEqual(mapAuthErrorMessage("Email not confirmed"), {
    text: "Confirma primeiro o teu endereço de email antes de iniciar sessão.",
    needsVerification: true,
  });
  assert.deepEqual(mapAuthErrorMessage("User already registered"), {
    text: "Já existe uma conta registada com este email. Inicia sessão ou reenvia o email de confirmação.",
    needsVerification: true,
  });
  assert.equal(mapAuthErrorMessage("Invalid login credentials").needsVerification, false);
  assert.equal(
    mapAuthErrorMessage('Email address "teste@edvania.ao" is invalid').text,
    "O endereço de email indicado não é válido ou não foi aceite pelo serviço de autenticação.",
  );
});
