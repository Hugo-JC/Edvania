"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Props = { mode: "login" | "register" };

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "").trim();
    const supabase = createClient();

    const result = isRegister
      ? await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (isRegister && !result.data.session) {
      setNotice("Conta criada. Confirma o teu endereço de email e depois inicia sessão.");
      return;
    }

    router.push(isRegister ? "/onboarding" : "/onboarding");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {isRegister && (
        <label>
          Nome completo
          <input name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
        </label>
      )}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Palavra-passe
        <input name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={10} />
        {isRegister && <small>Usa pelo menos 10 caracteres.</small>}
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "A processar…" : isRegister ? "Criar conta" : "Entrar"}
      </button>
    </form>
  );
}
