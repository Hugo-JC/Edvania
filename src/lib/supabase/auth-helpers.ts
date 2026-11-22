import type { NextRequest } from "next/server";

const SAFE_HOST_PATTERN = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;

function extractSafeHost(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  if (!first || !SAFE_HOST_PATTERN.test(first)) return null;
  return first.toLowerCase();
}

export function getSafePublicOrigin(request: NextRequest): string {
  const forwardedHost = extractSafeHost(request.headers.get("x-forwarded-host"));
  const hostHeader = extractSafeHost(request.headers.get("host"));
  const host = forwardedHost ?? hostHeader;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const fallbackProto = request.nextUrl.protocol.replace(":", "") || "http";
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : fallbackProto;

  if (host) {
    return `${proto}://${host}`;
  }
  return request.nextUrl.origin;
}

export function isTrustedSameOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return true;
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originHeader);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    return false;
  }

  const originHost = parsedOrigin.host.toLowerCase();
  const candidates = [
    extractSafeHost(request.headers.get("x-forwarded-host")),
    extractSafeHost(request.headers.get("host")),
    request.nextUrl.host.toLowerCase(),
  ].filter(Boolean) as string[];

  if (candidates.includes(originHost)) {
    return true;
  }

  // Allow proxied Google Cloud Run / AI Studio preview origins if forwarded headers were stripped
  if (parsedOrigin.hostname.endsWith(".run.app") && parsedOrigin.protocol === "https:") {
    return true;
  }

  return false;
}

export function sanitizeNextPath(raw: string | null, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || /[\u0000-\u001f]/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

export function mapAuthErrorMessage(message: string): { text: string; needsVerification: boolean } {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return {
      text: "Email ou palavra-passe inválidos. Confirma os teus dados ou cria uma conta nova.",
      needsVerification: false,
    };
  }
  if (lower.includes("email not confirmed")) {
    return {
      text: "Confirma primeiro o teu endereço de email antes de iniciar sessão.",
      needsVerification: true,
    };
  }
  if (lower.includes("user already registered") || lower.includes("already exists")) {
    return {
      text: "Já existe uma conta registada com este email. Inicia sessão ou reenvia o email de confirmação.",
      needsVerification: true,
    };
  }
  if (lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("for security purposes")) {
    return {
      text: "Muitas tentativas num curto espaço de tempo. Aguarda cerca de 60 segundos e tenta novamente.",
      needsVerification: false,
    };
  }
  if (lower.includes("password should be at least") || lower.includes("weak password")) {
    return {
      text: "A palavra-passe não cumpre os requisitos mínimos de segurança (mínimo 10 caracteres).",
      needsVerification: false,
    };
  }
  if (lower.includes("email_address_invalid") || lower.includes("unable to validate email") || (lower.includes("email address") && lower.includes("invalid"))) {
    return {
      text: "O endereço de email indicado não é válido ou não foi aceite pelo serviço de autenticação.",
      needsVerification: false,
    };
  }
  if (lower.includes("signups not allowed") || lower.includes("signup is disabled")) {
    return {
      text: "O registo de novas contas está temporariamente desactivado na configuração do projecto.",
      needsVerification: false,
    };
  }
  return {
    text: message || "Não foi possível autenticar. Tenta novamente.",
    needsVerification: false,
  };
}

export async function readAuthPayload(request: NextRequest): Promise<{
  isJson: boolean;
  body: Record<string, string>;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  const isJson = contentType.includes("application/json") || accept.includes("application/json");

  if (contentType.includes("application/json")) {
    try {
      const parsed = (await request.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed ?? {})) {
        if (typeof v === "string") out[k] = v;
      }
      return { isJson: true, body: out };
    } catch {
      return { isJson: true, body: {} };
    }
  }

  try {
    const formData = await request.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") out[k] = v;
    }
    return { isJson, body: out };
  } catch {
    return { isJson, body: {} };
  }
}
