"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Props = {
  mode: "login" | "register";
  initialError?: string;
  initialNotice?: string;
};

type AuthApiResponse = {
  ok?: boolean;
  error?: string;
  notice?: string;
  redirectTo?: string;
  needsVerification?: boolean;
  email?: string;
};

type SessionCheckResponse = {
  authenticated?: boolean;
};

export function AuthForm({ mode, initialError = "", initialNotice = "" }: Props) {
  const router = useRouter();
  const isRegister = mode === "register";
  const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState(initialNotice);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [cookiesBlocked, setCookiesBlocked] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Remove any legacy query-string credentials if a prior non-JS GET occurred.
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.search) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("email") || params.has("password") || params.has("fullName")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setIsPending(true);
    setError("");
    setNotice("");
    setCookiesBlocked(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    try {
      const payload = isRegister
        ? { fullName: fullName.trim(), email: email.trim(), password }
        : { email: email.trim(), password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        setCookiesBlocked(true);
        setError(
          "O pedido não recebeu resposta JSON do servidor (a pré-visualização ou o navegador bloqueou os cookies da sessão). Abre a app num novo separador para continuar.",
        );
        return;
      }

      const data = (await response.json().catch(() => null)) as AuthApiResponse | null;
      if (!data || !response.ok || data.ok !== true) {
        setError(data?.error || "Não foi possível concluir o pedido. Verifica os teus dados e tenta novamente.");
        if (data?.needsVerification) {
          setNeedsVerification(true);
          setVerificationEmail(email.trim().toLowerCase());
        } else {
          setNeedsVerification(false);
        }
        return;
      }

      if (data.needsVerification) {
        setNeedsVerification(true);
        setVerificationEmail(data.email || email.trim().toLowerCase());
        setNotice(
          data.notice ||
            "Conta criada! Verifica a tua caixa de entrada para confirmar o endereço de email.",
        );
        return;
      }

      const target = data.redirectTo && data.redirectTo.startsWith("/") ? data.redirectTo : "/dashboard";

      // Confirm browser stored the session cookie before navigating to protected routes.
      const sessionRes = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      }).catch(() => null);
      const sessionData = sessionRes?.ok
        ? ((await sessionRes.json().catch(() => null)) as SessionCheckResponse | null)
        : null;

      if (sessionData && !sessionData.authenticated) {
        setCookiesBlocked(true);
        setNotice("");
        setError(
          "A tua sessão foi autenticada, mas o navegador bloqueou o cookie de sessão neste painel incorporado (iframe). Abre a aplicação num separador próprio.",
        );
        return;
      }

      router.replace(target);
      router.refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("O servidor demorou demasiado tempo a responder. Verifica a tua ligação e tenta novamente.");
      } else {
        setError("Falha de ligação ao servidor. Confirma a tua ligação e tenta novamente.");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsPending(false);
    }
  }

  async function handleResendVerification() {
    const targetEmail = (verificationEmail || email).trim().toLowerCase();
    if (!targetEmail || isResending) return;

    setIsResending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = (await response.json().catch(() => ({}))) as AuthApiResponse;
      if (!response.ok || data.ok !== true) {
        setError(data.error || "Não foi possível reenviar o email de verificação.");
        return;
      }

      setNotice(
        data.notice ||
          "Reenviámos o email de confirmação. Verifica a caixa de entrada e a pasta de spam.",
      );
    } catch {
      setError("Falha ao comunicar com o servidor para reenviar o email.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <form className="form" action={endpoint} method="post" onSubmit={handleSubmit}>
      {isRegister && (
        <label>
          Nome completo
          <input
            name="fullName"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
      )}
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Palavra-passe
        <input
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 10 : 1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isRegister && <small>Usa pelo menos 10 caracteres.</small>}
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {cookiesBlocked && (
        <a
          className="quiet-button"
          href={isRegister ? "/register" : "/login"}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir num novo separador
        </a>
      )}
      {needsVerification && (
        <button
          type="button"
          className="quiet-button"
          onClick={handleResendVerification}
          disabled={isResending || !(verificationEmail || email).trim()}
        >
          {isResending ? "A reenviar…" : "Reenviar email de confirmação"}
        </button>
      )}
      <button className="primary-button" type="submit" disabled={isPending}>
        {isPending ? "A processar…" : isRegister ? "Criar conta" : "Entrar"}
      </button>
    </form>
  );
}
