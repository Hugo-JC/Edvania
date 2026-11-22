import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { PageEntrance } from "@/components/motion-primitives";

type Props = {
  searchParams: Promise<{
    email?: string;
    password?: string;
    fullName?: string;
    error?: string;
    notice?: string;
  }>;
};

const REGISTER_ERROR_MESSAGES: Record<string, string> = {
  "already-registered":
    "Já existe uma conta associada a este email. Inicia sessão ou reenvia o email de confirmação.",
  "register-failed": "Não foi possível criar a conta. Verifica os dados e tenta novamente.",
  "invalid-input": "Verifica o nome completo, o email e a palavra-passe (mínimo 10 caracteres).",
};

const REGISTER_NOTICE_MESSAGES: Record<string, string> = {
  "verify-email":
    "Conta criada! Enviámos um link de verificação para o teu email antes de iniciares sessão.",
};

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  if (
    params.email !== undefined ||
    params.password !== undefined ||
    params.fullName !== undefined
  ) {
    redirect("/register");
  }

  const initialError = params.error ? (REGISTER_ERROR_MESSAGES[params.error] ?? "") : "";
  const initialNotice = params.notice ? (REGISTER_NOTICE_MESSAGES[params.notice] ?? "") : "";

  return (
    <main className="auth-shell">
      <PageEntrance className="w-full flex justify-center">
        <section className="auth-card">
          <Link className="brand" href="/">
            Edvânia
          </Link>
          <p className="eyebrow">Nova conta</p>
          <h1>Cria a tua conta.</h1>
          <p className="muted">Em menos de um minuto configuras a tua loja e começas a registar artigos e vendas.</p>
          <AuthForm mode="register" initialError={initialError} initialNotice={initialNotice} />
          <p className="switch-auth">
            Já tens conta? <Link href="/login">Iniciar sessão</Link>
          </p>
        </section>
      </PageEntrance>
    </main>
  );
}
