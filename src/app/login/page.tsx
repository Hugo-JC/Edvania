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

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  "verification-failed":
    "O link de verificação expirou ou já foi utilizado. Inicia sessão ou cria novamente o pedido de confirmação.",
  "email-not-confirmed":
    "Confirma primeiro o teu endereço de email antes de iniciar sessão.",
  "invalid-credentials":
    "Email ou palavra-passe inválidos. Confirma os dados introduzidos.",
  "invalid-input": "Verifica o endereço de email e a palavra-passe.",
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  if (
    params.email !== undefined ||
    params.password !== undefined ||
    params.fullName !== undefined
  ) {
    redirect("/login");
  }

  const initialError = params.error ? (LOGIN_ERROR_MESSAGES[params.error] ?? "") : "";

  return (
    <main className="auth-shell">
      <PageEntrance className="w-full flex justify-center">
        <section className="auth-card">
          <Link className="brand" href="/">
            Edvânia
          </Link>
          <p className="eyebrow">Acesso à loja</p>
          <h1>Entra na tua conta.</h1>
          <p className="muted">Continua a gerir vendas, stock e caixa num ambiente tranquilo e organizado.</p>
          <AuthForm mode="login" initialError={initialError} />
          <p className="switch-auth">
            Ainda não tens conta? <Link href="/register">Criar conta</Link>
          </p>
        </section>
      </PageEntrance>
    </main>
  );
}
